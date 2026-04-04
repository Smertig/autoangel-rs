use autoangel_core::elements::config;
use autoangel_core::elements::data::{Data, DataEntry, DataView};
use autoangel_core::util::data_source::DataSource;

pub static ELEMENTS_V7: &[u8] = include_bytes!("../../tests/test_data/elements/elements_v7.data");
pub static TEST_ENTRY_ID: u32 = 1;

pub fn get_v7_config() -> config::Config {
    config::Config::find_bundled(7).unwrap()
}

pub fn elements_content() -> DataSource {
    DataSource::from_bytes(ELEMENTS_V7.to_vec())
}

pub fn create_test_data() -> Data {
    let config = get_v7_config();
    Data::from_bytes(ELEMENTS_V7.to_owned(), config).unwrap()
}

pub fn create_test_data_view(content: &DataSource) -> DataView {
    let config = get_v7_config();
    DataView::parse(content, config).unwrap()
}

pub fn find_test_entry() -> (usize, DataEntry) {
    let elements = create_test_data();
    elements.find_entry(TEST_ENTRY_ID, None, true).unwrap()
}
