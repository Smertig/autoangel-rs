window.BENCHMARK_DATA = {
  "lastUpdate": 1775330166985,
  "repoUrl": "https://github.com/Smertig/autoangel-rs",
  "entries": {
    "Rust Benchmark (Time)": [
      {
        "commit": {
          "author": {
            "email": "akaraevz@mail.ru",
            "name": "Smertig",
            "username": "Smertig"
          },
          "committer": {
            "email": "akaraevz@mail.ru",
            "name": "Smertig",
            "username": "Smertig"
          },
          "distinct": true,
          "id": "5d762f6aeb6dcf0b5ca5fef2a4fb72c312a9509f",
          "message": "Initial commit",
          "timestamp": "2026-04-04T22:13:26+03:00",
          "tree_id": "1e02ec7cdbb7389e0af26349382bd0b581ebdfd5",
          "url": "https://github.com/Smertig/autoangel-rs/commit/5d762f6aeb6dcf0b5ca5fef2a4fb72c312a9509f"
        },
        "date": 1775330166425,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 29499,
            "range": "± 1582",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 94,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 14,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 131,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 16786,
            "range": "± 80",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1639,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 15,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 269357,
            "range": "± 685",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 305,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3166,
            "range": "± 5",
            "unit": "ns/iter"
          }
        ]
      }
    ]
  }
}