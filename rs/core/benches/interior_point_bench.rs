//! Performance benchmark for interior_point (SineStar polygons).
//! Port of JTS InteriorPointAreaPerfTest.java.
//!
//! Run with: pnpm bench:rs (or cd rs && cargo bench)

mod utils;

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use interior_point::interior_point;
use utils::sine_star::{create_sine_star, reduce_precision};

// JTS InteriorPointAreaPerfTest parameters
const ORG_X: f64 = 100.0;
const ORG_Y: f64 = 100.0;
const SIZE: f64 = 100.0;
const N_ARMS: usize = 20;
const ARM_RATIO: f64 = 0.3;

fn bench_interior_point(c: &mut Criterion) {
    let sizes: &[usize] = &[10, 100, 1_000, 10_000, 100_000];
    let mut group = c.benchmark_group("interior_point");

    for &n_pts in sizes {
        let star = create_sine_star(ORG_X, ORG_Y, SIZE, n_pts, N_ARMS, ARM_RATIO);
        let scale = n_pts as f64 / SIZE;
        let poly = reduce_precision(&star, scale);
        let geom = geo_types::Geometry::Polygon(poly);

        group.bench_with_input(BenchmarkId::from_parameter(n_pts), &geom, |b, geom| {
            b.iter(|| interior_point(geom))
        });
    }
    group.finish();
}

criterion_group!(benches, bench_interior_point);
criterion_main!(benches);
