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

    pub fn read_int(&mut self, key: &str) -> Result<i32> {
        let v = self.read_value(key)?;
        v.parse()
            .map_err(|_| eyre!("Invalid int for '{}': '{}'", key, v))
    }

    pub fn read_hex_u32(&mut self, key: &str) -> Result<u32> {
        let v = self.read_value(key)?;
        u32::from_str_radix(v, 16).map_err(|_| eyre!("Invalid hex for '{}': '{}'", key, v))
    }

    pub fn read_float(&mut self, key: &str) -> Result<f32> {
        self.read_float_alt(&[key])
    }

    pub fn read_float_alt(&mut self, keys: &[&str]) -> Result<f32> {
        let v = self.read_value_alt(keys)?;
        v.parse()
            .map_err(|_| eyre!("Invalid float for {}: '{}'", format_alt_keys(keys), v))
    }

    pub fn read_vec3(&mut self, key: &str) -> Result<[f32; 3]> {
        let v = self.read_value(key)?;
        parse_vec3(v)
    }

    /// Peek at the key of the current line without consuming it.
    pub fn peek_key(&self) -> Option<&str> {
        self.lines
            .get(self.pos)
            .and_then(|l| split_kv(l.trim()).map(|(k, _)| k))
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

/// Split "Key: Value" into (key, value). Handles empty values like "Key: " or "Key:".
pub(crate) fn split_kv(line: &str) -> Option<(&str, &str)> {
    if let Some((k, v)) = line.split_once(": ") {
        Some((k.trim(), v.trim()))
    } else {
        let k = line.strip_suffix(':')?;
        Some((k.trim(), ""))
    }
}

pub(crate) fn parse_vec3(s: &str) -> Result<[f32; 3]> {
    let (a, rest) = s
        .split_once(',')
        .ok_or_else(|| eyre!("Expected 3 floats: '{s}'"))?;
    let (b, c) = rest
        .split_once(',')
        .ok_or_else(|| eyre!("Expected 3 floats: '{s}'"))?;
    Ok([
        a.trim()
            .parse()
            .map_err(|_| eyre!("Invalid float: '{}'", a.trim()))?,
        b.trim()
            .parse()
            .map_err(|_| eyre!("Invalid float: '{}'", b.trim()))?,
        c.trim()
            .parse()
            .map_err(|_| eyre!("Invalid float: '{}'", c.trim()))?,
    ])
}
