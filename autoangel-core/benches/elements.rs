mod elements_helpers;

use autoangel_core::elements::data::DataFieldView;
use criterion::{Criterion, criterion_group, criterion_main};
use elements_helpers::*;
use std::hint::black_box;
use std::io::Cursor;

pub fn elements_parse(c: &mut Criterion) {
    let content = elements_content();
    c.bench_function("DataView::parse", |b| {
        b.iter(|| {
            let elements = create_test_data_view(&content);
            black_box(elements);
        })
    });
}

pub fn elements_find_entry(c: &mut Criterion) {
    let elements = create_test_data();

    c.bench_function("Data::find_entry", |b| {
        b.iter(|| {
            let entry = black_box(pollster::block_on(elements.find_entry(
                TEST_ENTRY_ID,
                None,
                true,
            )));
            assert!(entry.is_some());
        })
    });
}

pub fn elements_access_fields(c: &mut Criterion) {
    let (_, entry) = find_test_entry();

    c.bench_function("DataEntry::access_fields", |b| {
        b.iter(|| {
            let fields = entry.fields.read();
            for field in fields.iter() {
                black_box(pollster::block_on(field.get_bytes(&entry.content)).unwrap());
            }
        })
    });
}

pub fn elements_deep_clone(c: &mut Criterion) {
    let (_, entry) = find_test_entry();

    c.bench_function("DataEntry::deep_clone", |b| {
        b.iter(|| {
            let cloned_entry = black_box(pollster::block_on(entry.deep_clone()).unwrap());
            assert_eq!(cloned_entry.fields.read().len(), entry.fields.read().len());
        })
    });
}

pub fn elements_write(c: &mut Criterion) {
    let elements = create_test_data();

    c.bench_function("Data::write", |b| {
        b.iter(|| {
            let mut buffer = Cursor::new(Vec::new());
            pollster::block_on(elements.write(&mut std::io::BufWriter::new(&mut buffer))).unwrap();
            black_box(buffer.into_inner());
        })
    });
}

pub fn elements_iterate_lists(c: &mut Criterion) {
    let elements = create_test_data();

    c.bench_function("Data::iterate_lists", |b| {
        b.iter(|| {
            for list in elements.lists.iter() {
                let entries = list.entries.read();
                for lazy_entry in entries.iter() {
                    let entry =
                        pollster::block_on(lazy_entry.resolve(&elements.content, &list.config))
                            .unwrap();
                    black_box(entry);
                }
            }
        })
    });
}

pub fn elements_modify_field(c: &mut Criterion) {
    let (_, entry) = find_test_entry();
    let entry_clone = pollster::block_on(entry.deep_clone()).unwrap();

    c.bench_function("DataEntry::modify_field", |b| {
        b.iter(|| {
            let mut fields = entry_clone.fields.write();

            if !fields.is_empty() {
                let first_field =
                    pollster::block_on(fields[0].get_bytes(&entry_clone.content)).unwrap();
                fields[0] = DataFieldView::Bytes(first_field.into());
            }

            black_box(&fields);
        })
    });
}

criterion_group!(
    benches,
    elements_parse,
    elements_find_entry,
    elements_access_fields,
    elements_deep_clone,
    elements_write,
    elements_iterate_lists,
    elements_modify_field
);
criterion_main!(benches);
