pub mod data_source;
pub mod line_reader;
pub mod throttle;

pub trait DropLeadingZeros {
    fn drop_leading_zeros(self) -> Self;
}

impl<T> DropLeadingZeros for &[T]
where
    T: Default + Ord,
{
    fn drop_leading_zeros(self) -> Self {
        let zero = T::default();

        match self.iter().position(|e| *e == zero) {
            Some(pos) => &self[..pos],
            None => self,
        }
    }
}

impl DropLeadingZeros for String {
    fn drop_leading_zeros(mut self) -> Self {
        for (i, c) in self.char_indices() {
            if c == '\0' {
                self.drain(i..);
                break;
            }
        }

        self
    }
}

#[macro_export]
macro_rules! get_test_data_path {
    ($file:expr) => {
        concat!(env!("CARGO_MANIFEST_DIR"), "/../tests/test_data/", $file)
    };
}

#[macro_export]
macro_rules! include_test_data_bytes {
    ($file:expr) => {
        include_bytes!($crate::get_test_data_path!($file))
    };
}

#[macro_export]
macro_rules! include_resources_str {
    ($file:expr) => {
        include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/", $file))
    };
}
