mod alloc_measurement;
mod elements_helpers;

use alloc_measurement::{MemStats, bench, bench_scenario, measure, measure_bytes};
use autoangel_core::elements::data::DataFieldView;
use elements_helpers::*;
use std::hint::black_box;
use std::io::Cursor;

fn main() {
    let content = elements_content();

    bench("DataView::parse", || {
        measure_bytes(|| {
            black_box(create_test_data_view(&content));
        })
    });

    let elements = create_test_data();

    bench("Data::find_entry", || {
        measure_bytes(|| {
            let entry = black_box(pollster::block_on(elements.find_entry(
                TEST_ENTRY_ID,
                None,
                true,
            )));
            assert!(entry.is_some());
        })
    });

    let (_, entry) = find_test_entry();
    bench("DataEntry::deep_clone", || {
        measure_bytes(|| {
            let cloned = black_box(pollster::block_on(entry.deep_clone()).unwrap());
            assert_eq!(cloned.fields.read().len(), entry.fields.read().len());
        })
    });

    bench("Data::write", || {
        measure_bytes(|| {
            let mut buffer = Cursor::new(Vec::new());
            black_box(pollster::block_on(
                elements.write(&mut std::io::BufWriter::new(&mut buffer)),
            ))
            .unwrap();
            black_box(buffer.into_inner());
        })
    });

    let entry_clone = pollster::block_on(entry.deep_clone()).unwrap();
    bench("DataEntry::modify_field", || {
        measure_bytes(|| {
            let mut fields = entry_clone.fields.write();
            if !fields.is_empty() {
                let first_field =
                    pollster::block_on(fields[0].get_bytes(&entry_clone.content)).unwrap();
                fields[0] = DataFieldView::Bytes(first_field.into());
            }
            black_box(&fields);
        })
    });

    bench_scenario("Data [just parsed]", || {
        let (_view, stats) = measure(|| create_test_data_view(&content));
        stats
    });

    bench_scenario("Data [parsed + iterated]", || {
        let (data, parse_stats) = measure(|| create_test_data_view(&content));
        let (_, iter_stats) = measure(|| {
            for list in data.lists.iter() {
                for lazy_entry in list.entries.read().iter() {
                    let entry =
                        pollster::block_on(lazy_entry.resolve(&content, &list.config)).unwrap();
                    let fields = entry.fields.read();
                    for field in fields.iter() {
                        black_box(pollster::block_on(field.get_bytes(&content)).unwrap());
                    }
                }
            }
        });
        MemStats {
            allocated: parse_stats.allocated + iter_stats.allocated,
            retained: parse_stats.retained + iter_stats.retained,
        }
    });

    bench_scenario("Data [parsed + 3 searches]", || {
        let (data, parse_stats) = measure(|| {
            let view = create_test_data_view(&content);
            autoangel_core::elements::data::Data::from(view, content.clone())
        });
        let (_, search_stats) = measure(|| {
            for _ in 0..3 {
                black_box(pollster::block_on(data.find_entry(
                    TEST_ENTRY_ID,
                    None,
                    true,
                )));
            }
        });
        MemStats {
            allocated: parse_stats.allocated + search_stats.allocated,
            retained: parse_stats.retained + search_stats.retained,
        }
    });
}
