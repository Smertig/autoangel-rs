use stats_alloc::{INSTRUMENTED_SYSTEM, Region, StatsAlloc};
use std::alloc::System;
use std::hint::black_box;

#[global_allocator]
static GLOBAL: &StatsAlloc<System> = &INSTRUMENTED_SYSTEM;

pub struct MemStats {
    pub allocated: usize,
    pub retained: isize,
}

/// Run `f`, keep its return value alive, and measure memory.
pub fn measure<T, F: FnOnce() -> T>(f: F) -> (T, MemStats) {
    let reg = Region::new(GLOBAL);
    let result = black_box(f());
    let stats = reg.change();
    let mem = MemStats {
        allocated: stats.bytes_allocated,
        // bytes_reallocated deltas are already folded into bytes_allocated/bytes_deallocated
        retained: stats.bytes_allocated as isize - stats.bytes_deallocated as isize,
    };
    (result, mem)
}

/// Run `f` (discarding its result) and return total bytes allocated.
pub fn measure_bytes<F: FnOnce()>(f: F) -> usize {
    let reg = Region::new(GLOBAL);
    f();
    reg.change().bytes_allocated
}

fn print_bench_line(name: &str, value: usize, delta: usize) {
    println!("test {name} ... bench: {value:>12} bytes/iter (+/- {delta})");
}

/// Print a benchmark line in bencher format (single metric).
pub fn bench(name: &str, f: impl Fn() -> usize) {
    let _ = f();
    let v1 = f();
    let v2 = f();
    let delta = v1.abs_diff(v2);
    print_bench_line(name, v1, delta);
}

/// Print two benchmark lines: total allocated and retained memory.
pub fn bench_scenario(name: &str, f: impl Fn() -> MemStats) {
    let _ = f();
    let s1 = f();
    let s2 = f();
    print_bench_line(
        &format!("{name}/allocated"),
        s1.allocated,
        s1.allocated.abs_diff(s2.allocated),
    );
    print_bench_line(
        &format!("{name}/retained"),
        s1.retained as usize,
        s1.retained.abs_diff(s2.retained),
    );
}
