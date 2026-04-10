mod alloc_measurement;

use alloc_measurement::{MemStats, bench, bench_scenario, measure, measure_bytes};
use autoangel_core::pck::package::{PackageConfig, PackageInfo};
use autoangel_core::util::data_source::DataSource;
use std::hint::black_box;
use std::io::Cursor;

static CONFIGS_PCK: &[u8] = include_bytes!("../../tests/test_data/packages/configs.pck");

fn configs_ds() -> DataSource<Vec<u8>> {
    DataSource::from_bytes(CONFIGS_PCK.to_vec())
}

fn main() {
    let content = configs_ds();

    bench("PackageInfo::parse", || {
        measure_bytes(|| {
            let package = pollster::block_on(PackageInfo::parse(
                &content,
                Default::default(),
                Default::default(),
            ))
            .unwrap();
            black_box(package);
        })
    });

    let package = pollster::block_on(PackageInfo::parse(
        &content,
        Default::default(),
        Default::default(),
    ))
    .unwrap();

    bench("PackageInfo::get_file", || {
        measure_bytes(|| {
            let file_content = black_box(
                pollster::block_on(package.get_file(
                    &content,
                    "configs/autofamilyconfigs/parameters/整体高度/2.ini",
                ))
                .unwrap(),
            );
            assert!(file_content.starts_with("[main_Terrain_Height]".as_bytes()));
        })
    });

    bench("PackageInfo::get_all_files", || {
        measure_bytes(|| {
            let total_size: usize = black_box(&package)
                .find_prefix("")
                .iter()
                .map(|entry| pollster::block_on(package.get_file(&content, &entry.normalized_name)))
                .map(|content| content.unwrap().len())
                .sum();
            assert_eq!(total_size, 6204669);
        })
    });

    let save_config = PackageConfig::default();
    bench("PackageInfo::save_to", || {
        measure_bytes(|| {
            let mut buffer = Cursor::new(Vec::new());
            black_box(pollster::block_on(package.save_to(
                &content,
                &mut buffer,
                &save_config,
            )))
            .unwrap();
            black_box(buffer.into_inner());
        })
    });

    bench_scenario("PackageInfo [just parsed]", || {
        let (_pkg, stats) = measure(|| {
            pollster::block_on(PackageInfo::parse(
                &content,
                Default::default(),
                Default::default(),
            ))
            .unwrap()
        });
        stats
    });

    bench_scenario("PackageInfo [parsed + all files]", || {
        let (pkg, parse_stats) = measure(|| {
            pollster::block_on(PackageInfo::parse(
                &content,
                Default::default(),
                Default::default(),
            ))
            .unwrap()
        });
        let (_files, iter_stats) = measure(|| {
            pkg.find_prefix("")
                .iter()
                .map(|entry| {
                    pollster::block_on(pkg.get_file(&content, &entry.normalized_name)).unwrap()
                })
                .collect::<Vec<_>>()
        });
        MemStats {
            allocated: parse_stats.allocated + iter_stats.allocated,
            retained: parse_stats.retained + iter_stats.retained,
        }
    });

    let sample_files: Vec<String> = package
        .find_prefix("")
        .iter()
        .take(3)
        .map(|e| e.normalized_name.clone())
        .collect();
    assert_eq!(
        sample_files.len(),
        3,
        "need at least 3 files in the package"
    );

    bench_scenario("PackageInfo [parsed + 3 files]", || {
        let (pkg, parse_stats) = measure(|| {
            pollster::block_on(PackageInfo::parse(
                &content,
                Default::default(),
                Default::default(),
            ))
            .unwrap()
        });
        let (_files, get_stats) = measure(|| {
            sample_files
                .iter()
                .map(|path| pollster::block_on(pkg.get_file(&content, path)).expect(path))
                .collect::<Vec<_>>()
        });
        MemStats {
            allocated: parse_stats.allocated + get_stats.allocated,
            retained: parse_stats.retained + get_stats.retained,
        }
    });
}
