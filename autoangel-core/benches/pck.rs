use autoangel_core::pck::package::{PackageConfig, PackageInfo};
use autoangel_core::util::data_source::DataSource;
use criterion::{Criterion, criterion_group, criterion_main};
use std::hint::black_box;
use std::io::Cursor;

static CONFIGS_PCK: &[u8] = include_bytes!("../../tests/test_data/packages/configs.pck");

fn configs_ds() -> DataSource {
    DataSource::from_bytes(CONFIGS_PCK.to_vec())
}

pub fn package_parse(c: &mut Criterion) {
    let content = configs_ds();
    c.bench_function("PackageInfo::parse", |b| {
        b.iter(|| {
            let package =
                PackageInfo::parse(&content, Default::default(), Default::default()).unwrap();
            black_box(package);
        })
    });
}

pub fn package_file_list(c: &mut Criterion) {
    let content = configs_ds();
    let package = PackageInfo::parse(&content, Default::default(), Default::default()).unwrap();

    c.bench_function("PackageInfo::find_prefix", |b| {
        b.iter(|| {
            let file_count = black_box(package.find_prefix("").len());
            assert_eq!(file_count, package.file_count());
        })
    });
}

pub fn package_get_file(c: &mut Criterion) {
    let content = configs_ds();
    let package = PackageInfo::parse(&content, Default::default(), Default::default()).unwrap();

    c.bench_function("PackageInfo::get_file", |b| {
        b.iter(|| {
            let file_content = black_box(
                package
                    .get_file(
                        &content,
                        "configs/autofamilyconfigs/parameters/整体高度/2.ini",
                    )
                    .unwrap(),
            );

            assert!(file_content.starts_with("[main_Terrain_Height]".as_bytes()));
        })
    });
}

pub fn package_get_all_files(c: &mut Criterion) {
    let content = configs_ds();
    let package = PackageInfo::parse(&content, Default::default(), Default::default()).unwrap();

    c.bench_function("PackageInfo::get_all_files", |b| {
        b.iter(|| {
            let total_size: usize = black_box(&package)
                .find_prefix("")
                .iter()
                .map(|entry| package.get_file(&content, &entry.normalized_name))
                .map(|content| content.unwrap().len())
                .sum();

            assert_eq!(total_size, 8027844);
        })
    });
}

pub fn package_save(c: &mut Criterion) {
    let content = configs_ds();
    let package = PackageInfo::parse(&content, Default::default(), Default::default()).unwrap();
    let config = PackageConfig::default();

    c.bench_function("PackageInfo::save_to", |b| {
        b.iter(|| {
            let mut buffer = Cursor::new(Vec::new());
            black_box(package.save_to(&content, &mut buffer, &config)).unwrap();
            black_box(buffer.into_inner());
        })
    });
}

criterion_group!(
    benches,
    package_parse,
    package_file_list,
    package_get_file,
    package_get_all_files,
    package_save
);
criterion_main!(benches);
