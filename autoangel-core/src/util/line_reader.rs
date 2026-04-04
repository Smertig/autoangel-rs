use eyre::{Result, bail};

pub struct LineReader<'a, I: Iterator<Item = (usize, &'a str)>>(I, Option<usize>);

impl<'a, I: Iterator<Item = (usize, &'a str)>> LineReader<'a, I> {
    pub fn new(i: I) -> Self {
        LineReader(i, None)
    }

    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> Result<&'a str> {
        match self.0.next() {
            Some((index, line)) => {
                self.1 = Some(index);
                Ok(line)
            }
            None => match self.1 {
                Some(index) => bail!("Missing lines after #{}", index + 1),
                None => bail!("No lines"),
            },
        }
    }
}

pub fn make_line_reader(content: &str) -> LineReader<'_, impl Iterator<Item = (usize, &str)>> {
    let i = content
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty());

    LineReader::new(i)
}
