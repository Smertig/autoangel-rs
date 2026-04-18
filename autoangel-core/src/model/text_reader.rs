use eyre::{Result, eyre};

/// Line-by-line positional reader. Consumes lines in order.
pub(crate) struct Lines<'a> {
    lines: Vec<&'a str>,
    pos: usize,
}

impl<'a> Lines<'a> {
    pub fn new(text: &'a str) -> Self {
        Lines {
            lines: text.lines().collect(),
            pos: 0,
        }
    }

    pub fn done(&self) -> bool {
        self.pos >= self.lines.len()
    }

    /// Read next line, trimming whitespace.
    pub fn next_line(&mut self) -> Result<&'a str> {
        if self.pos >= self.lines.len() {
            eyre::bail!("Unexpected end of file at line {}", self.pos);
        }
        let line = self.lines[self.pos].trim();
        self.pos += 1;
        Ok(line)
    }

    /// Read next line, parse as "Key: Value", return value. Key match is
    /// case-sensitive.
    pub fn read_value(&mut self, expected_key: &str) -> Result<&'a str> {
        self.read_value_alt(&[expected_key])
    }

    /// Like `read_value` but accepts any of the given exact key spellings.
    /// Used when the engine renamed a key across versions and old+new data
    /// files coexist (e.g. v103 fixed the `DedaultScale` typo to
    /// `DefaultScale`). Matching is case-sensitive — same as the Angelica
    /// engine's own `sscanf`-based parser.
    pub fn read_value_alt(&mut self, keys: &[&str]) -> Result<&'a str> {
        let line = self.next_line()?;
        let got = match split_kv(line) {
            Some((k, v)) if keys.contains(&k) => return Ok(v),
            Some((k, _)) => format!("'{}:'", k),
            None => format!("'{}'", line),
        };
        eyre::bail!(
            "Expected {}, got {} at line {}",
            format_alt_keys(keys),
            got,
            self.pos - 1
        );
    }

    /// Read a `Key: Value` line and parse the value as `T`.
    pub fn read<T: LineValue>(&mut self, key: &str) -> Result<T> {
        let v = self.read_value(key)?;
        T::parse_line_value(v)
            .ok_or_else(|| eyre!("Invalid {} for '{}': '{}'", T::TYPE_NAME, key, v))
    }

    /// Like `read` but accepts any of the given exact key spellings.
    pub fn read_alt<T: LineValue>(&mut self, keys: &[&str]) -> Result<T> {
        let v = self.read_value_alt(keys)?;
        T::parse_line_value(v).ok_or_else(|| {
            eyre!(
                "Invalid {} for {}: '{}'",
                T::TYPE_NAME,
                format_alt_keys(keys),
                v
            )
        })
    }

    /// Conditionally read: returns `Some(v)` iff `cond` is true, consuming
    /// a line; `None` otherwise. Collapses the
    /// `(cond).then(|| r.read(k)).transpose()?` pattern used for
    /// version-gated optional fields.
    pub fn read_if<T: LineValue>(&mut self, cond: bool, key: &str) -> Result<Option<T>> {
        if !cond {
            return Ok(None);
        }
        self.read(key).map(Some)
    }

    /// Hex-encoded `u32` (e.g. `OrgColor: ffffffff`) — distinct parser so
    /// kept as a specialized method instead of a `LineValue` impl.
    pub fn read_hex_u32(&mut self, key: &str) -> Result<u32> {
        let v = self.read_value(key)?;
        u32::from_str_radix(v, 16).map_err(|_| eyre!("Invalid hex for '{}': '{}'", key, v))
    }

    /// Peek at the key of the current line without consuming it.
    pub fn peek_key(&self) -> Option<&str> {
        self.lines
            .get(self.pos)
            .and_then(|l| split_kv(l.trim()).map(|(k, _)| k))
    }
}

/// Types that can be parsed from the value portion of a `Key: Value` line.
pub(crate) trait LineValue: Sized {
    /// Human-readable type name used in parse-error messages.
    const TYPE_NAME: &'static str;
    /// Parse the trimmed value portion. Returns `None` on format error;
    /// the caller supplies key + value context for the outer `Result`.
    fn parse_line_value(s: &str) -> Option<Self>;
}

impl LineValue for i32 {
    const TYPE_NAME: &'static str = "int";
    fn parse_line_value(s: &str) -> Option<Self> {
        s.parse().ok()
    }
}

impl LineValue for f32 {
    const TYPE_NAME: &'static str = "float";
    /// Tolerant to Windows MSVCRT special-value prints that leak into
    /// engine-saved files via `sprintf("%f", ...)` on non-finite values:
    /// `1.#INF` / `-1.#INF` map to signed infinity; `1.#QNAN0` / `-1.#IND`
    /// map to NaN.
    fn parse_line_value(s: &str) -> Option<Self> {
        if let Ok(v) = s.parse() {
            return Some(v);
        }
        let (negative, rest) = match s.strip_prefix('-') {
            Some(r) => (true, r),
            None => (false, s),
        };
        let tag = rest.strip_prefix("1.#")?;
        if tag.starts_with("INF") {
            Some(if negative {
                f32::NEG_INFINITY
            } else {
                f32::INFINITY
            })
        } else if tag.starts_with("QNAN") || tag.starts_with("SNAN") || tag.starts_with("IND") {
            Some(f32::NAN)
        } else {
            None
        }
    }
}

impl LineValue for bool {
    const TYPE_NAME: &'static str = "bool";
    /// Engine convention: 0 = false, nonzero = true (stored as `%d`).
    fn parse_line_value(s: &str) -> Option<Self> {
        s.parse::<i32>().ok().map(|n| n != 0)
    }
}

impl LineValue for [f32; 3] {
    const TYPE_NAME: &'static str = "vec3";
    fn parse_line_value(s: &str) -> Option<Self> {
        let (a, rest) = s.split_once(',')?;
        let (b, c) = rest.split_once(',')?;
        Some([
            f32::parse_line_value(a.trim())?,
            f32::parse_line_value(b.trim())?,
            f32::parse_line_value(c.trim())?,
        ])
    }
}

impl LineValue for String {
    const TYPE_NAME: &'static str = "string";
    fn parse_line_value(s: &str) -> Option<Self> {
        Some(s.to_string())
    }
}

/// Format an alternatives list for error messages: `'A:' or 'B:'` / `'A:'`.
fn format_alt_keys(keys: &[&str]) -> String {
    match keys {
        [] => "<no keys>".to_string(),
        [k] => format!("'{}:'", k),
        _ => keys
            .iter()
            .map(|k| format!("'{}:'", k))
            .collect::<Vec<_>>()
            .join(" or "),
    }
}

/// Split "Key: Value" into (key, value). Also tolerates `Key:Value`
/// with no space after the colon — at least one real archive file
/// emits that form (`gfx\场景\空1.gfx` has `Path:Effect\...`). Empty
/// values (`Key:` / `Key: `) return `""`.
pub(crate) fn split_kv(line: &str) -> Option<(&str, &str)> {
    let (k, v) = line.split_once(':')?;
    Some((k.trim(), v.trim()))
}
