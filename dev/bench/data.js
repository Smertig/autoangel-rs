window.BENCHMARK_DATA = {
  "lastUpdate": 1775736723358,
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
      },
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
          "id": "e5aaab87c4b09eb1edac6721c718d83c151c71e5",
          "message": "docs [pck]: show errors in a dismissible banner below header\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-05T12:19:46+03:00",
          "tree_id": "091b91d0755855acc213514e2d7138f511335e50",
          "url": "https://github.com/Smertig/autoangel-rs/commit/e5aaab87c4b09eb1edac6721c718d83c151c71e5"
        },
        "date": 1775382094928,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 28693,
            "range": "± 239",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 61,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 129,
            "range": "± 7",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 22903,
            "range": "± 70",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1510,
            "range": "± 4",
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
            "value": 304408,
            "range": "± 739",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 331,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3581,
            "range": "± 5",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "bc2c681f4f261f055842904e0e833bfde82e8f9d",
          "message": "docs: add custom config panel and error banner to elements viewer\n\n* Config panel supports paste, file picker, and drag-drop of .cfg files\n\n* Parse errors shown in a dismissible banner below header (both viewers)\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-05T14:51:22+03:00",
          "tree_id": "09a4705252ce218120e59a3c147331c94804e7a6",
          "url": "https://github.com/Smertig/autoangel-rs/commit/bc2c681f4f261f055842904e0e833bfde82e8f9d"
        },
        "date": 1775390428633,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 30400,
            "range": "± 1558",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 68,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 129,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 21094,
            "range": "± 42",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1502,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 14,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 302695,
            "range": "± 10666",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 331,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3604,
            "range": "± 7",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "5e7bf98183709d98bec2a12419b5b85d3ec86d4b",
          "message": "bump version to 0.8.1\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-05T15:32:02+03:00",
          "tree_id": "8470eb49ef8786a4db4c066a6e439e5799a7f65c",
          "url": "https://github.com/Smertig/autoangel-rs/commit/5e7bf98183709d98bec2a12419b5b85d3ec86d4b"
        },
        "date": 1775392594590,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 31505,
            "range": "± 187",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 60,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 128,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 21336,
            "range": "± 972",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1541,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 14,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 302259,
            "range": "± 598",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 307,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3581,
            "range": "± 12",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "8172fd2152efc85034fb671e3163d966f2f1f1ab",
          "message": "misc: fix formatting",
          "timestamp": "2026-04-05T19:55:06+03:00",
          "tree_id": "aecdab46ae6b98be5462f8cf7502c208bbcc2145",
          "url": "https://github.com/Smertig/autoangel-rs/commit/8172fd2152efc85034fb671e3163d966f2f1f1ab"
        },
        "date": 1775409485949,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 28940,
            "range": "± 531",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 60,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 129,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 25588,
            "range": "± 340",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1524,
            "range": "± 8",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 14,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 302960,
            "range": "± 1574",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 307,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3605,
            "range": "± 6",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "fb6082741808dce069c8f839d216c6e543813e38",
          "message": "bump version to 0.8.2\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-05T21:58:36+03:00",
          "tree_id": "0d55a5f3177792f1cdc1f0fe277cde1ea718b7b9",
          "url": "https://github.com/Smertig/autoangel-rs/commit/fb6082741808dce069c8f839d216c6e543813e38"
        },
        "date": 1775415683919,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 32702,
            "range": "± 164",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 69,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 128,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 25801,
            "range": "± 65",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1519,
            "range": "± 2",
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
            "value": 281826,
            "range": "± 361",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 331,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3332,
            "range": "± 8",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "c8893ae848c17cb33815d96a2b8ef74a9a0b4878",
          "message": "docs: add no-cache dev server for local WASM testing\n\nReplaces `python -m http.server` which uses heuristic caching,\ncausing stale WASM files to be served after rebuilds.\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-06T09:24:50+03:00",
          "tree_id": "332065e5e61b10c72f90717a7164867579bc54ad",
          "url": "https://github.com/Smertig/autoangel-rs/commit/c8893ae848c17cb33815d96a2b8ef74a9a0b4878"
        },
        "date": 1775468154124,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 29785,
            "range": "± 174",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 61,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 131,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 22956,
            "range": "± 54",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1541,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 14,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 280648,
            "range": "± 3582",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 307,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3441,
            "range": "± 4",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "bd75c451ea1261daf577b49ca60e1b84a0b0c255",
          "message": "multi-pkx [wasm, docs]: merge open/open2, update demos\n\nCloses #2\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-06T21:33:45+03:00",
          "tree_id": "281ac7778cb230df88b794841625c40dc1714d1d",
          "url": "https://github.com/Smertig/autoangel-rs/commit/bd75c451ea1261daf577b49ca60e1b84a0b0c255"
        },
        "date": 1775500631175,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 32852,
            "range": "± 226",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 61,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 185,
            "range": "± 4",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 20960,
            "range": "± 44",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1498,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 14,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 281747,
            "range": "± 155",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 307,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3395,
            "range": "± 14",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "7e25b12864452a78187096bc7421cce0480108d5",
          "message": "docs: add stale .venv troubleshooting note to CLAUDE.md\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-06T21:49:31+03:00",
          "tree_id": "6e5f1d5e2de598ec042dac9af6b62d522b02b8fa",
          "url": "https://github.com/Smertig/autoangel-rs/commit/7e25b12864452a78187096bc7421cce0480108d5"
        },
        "date": 1775501591771,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 33048,
            "range": "± 374",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 61,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 185,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 21091,
            "range": "± 47",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1513,
            "range": "± 2",
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
            "value": 282078,
            "range": "± 667",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 307,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3342,
            "range": "± 49",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "abbd72dbf8b5a762c319a36b257ff643200317d3",
          "message": "bump version to 0.8.4\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-06T21:49:31+03:00",
          "tree_id": "cab2fe92a83425646f0fc9bb864b325ffe69bbe9",
          "url": "https://github.com/Smertig/autoangel-rs/commit/abbd72dbf8b5a762c319a36b257ff643200317d3"
        },
        "date": 1775501711857,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 29907,
            "range": "± 392",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 66,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 130,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 20326,
            "range": "± 51",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1538,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 14,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 283999,
            "range": "± 469",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 332,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3382,
            "range": "± 1",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "7dd96f8ccdd18e50689f06bdcb1134f518b55180",
          "message": "pck: add on_progress callback with throttling for package parsing\n\n* Callback reports (index, total) for each file entry during parse, with optional time-based throttling via progress_interval_ms (default 0 = no throttling); first and last entries always reported\n\n* Exposed in Python (read_pck/read_pck_bytes on_progress + progress_interval_ms kwargs) and WASM (onProgress + progressIntervalMs in options bag)\n\n* Added web-time dependency for cross-platform Instant (native + WASM)\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T00:50:33+03:00",
          "tree_id": "84308aacb4c83ab03acf1f406604f6909af61146",
          "url": "https://github.com/Smertig/autoangel-rs/commit/7dd96f8ccdd18e50689f06bdcb1134f518b55180"
        },
        "date": 1775547693095,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 30732,
            "range": "± 1367",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 60,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
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
            "value": 23143,
            "range": "± 537",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1521,
            "range": "± 2",
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
            "value": 292750,
            "range": "± 725",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 331,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3336,
            "range": "± 2",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "19b17cba0a0ee70fb50b7afbf293756180c5cbad",
          "message": "bump version to 0.8.5",
          "timestamp": "2026-04-07T00:53:05+03:00",
          "tree_id": "5903cecff41b5558b58c19714eff1c2c14a4f8d4",
          "url": "https://github.com/Smertig/autoangel-rs/commit/19b17cba0a0ee70fb50b7afbf293756180c5cbad"
        },
        "date": 1775547827759,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 32515,
            "range": "± 231",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 61,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 13,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 129,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 24182,
            "range": "± 925",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 1569,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 14,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 303858,
            "range": "± 402",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 332,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3623,
            "range": "± 5",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "a923ff3705073499ca99b743b80791698a426851",
          "message": "async: make DataReader async and DataSource generic\n\n* DataReader::read_at is now async fn, DataSource<R> uses static dispatch via generics\n\n* New BufferedFileReader reads JS File objects with 4MB read-ahead buffer\n\n* Python API stays sync via pollster::block_on at pyo3 boundaries\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T15:09:42+03:00",
          "tree_id": "7da151cb98773335931ed16426a4beddfa44dfd4",
          "url": "https://github.com/Smertig/autoangel-rs/commit/a923ff3705073499ca99b743b80791698a426851"
        },
        "date": 1775565128318,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 35651,
            "range": "± 118",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 117,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 71,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 160,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 23120,
            "range": "± 64",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 12730,
            "range": "± 244",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 47,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 354989,
            "range": "± 3841",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 331,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3377,
            "range": "± 4",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "bd48d7882f03867e027b2c96a29ffdcde7b0cb0d",
          "message": "async: make DataReader async and DataSource generic\n\n* DataReader::read_at is now async fn, DataSource<R> uses static dispatch via generics\n\n* New BufferedFileReader reads JS File objects with 4MB read-ahead buffer\n\n* Python API stays sync via pollster::block_on at pyo3 boundaries\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T15:35:02+03:00",
          "tree_id": "5090ca97a4e4cc5e6d3521320dae732643340118",
          "url": "https://github.com/Smertig/autoangel-rs/commit/bd48d7882f03867e027b2c96a29ffdcde7b0cb0d"
        },
        "date": 1775565666875,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 36170,
            "range": "± 286",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 114,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 72,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 162,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 21047,
            "range": "± 257",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 13778,
            "range": "± 298",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 48,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 303340,
            "range": "± 1600",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 334,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3478,
            "range": "± 15",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "44dffbb6fb07fda30335402f5aa9003791da8089",
          "message": "bump version to 0.8.6",
          "timestamp": "2026-04-07T07:21:53+03:00",
          "tree_id": "cfb453d441f7d02c213e74a0372d67a0f2204601",
          "url": "https://github.com/Smertig/autoangel-rs/commit/44dffbb6fb07fda30335402f5aa9003791da8089"
        },
        "date": 1775565877162,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 31966,
            "range": "± 1346",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 133,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 71,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 159,
            "range": "± 3",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 20458,
            "range": "± 46",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 13443,
            "range": "± 223",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 46,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 295644,
            "range": "± 184",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 331,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3452,
            "range": "± 23",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "82ed66d6ec39c4c3931e137dc18d6d5216a95287",
          "message": "docs: accept .pkx1-.pkx5 extensions in file pickers\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T09:44:00+03:00",
          "tree_id": "a21afe2aec0c7af2e5f7e8cea9b0c36988adb6a6",
          "url": "https://github.com/Smertig/autoangel-rs/commit/82ed66d6ec39c4c3931e137dc18d6d5216a95287"
        },
        "date": 1775570799185,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 33913,
            "range": "± 1023",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 118,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 71,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 160,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 22757,
            "range": "± 81",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 13281,
            "range": "± 123",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 49,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 290100,
            "range": "± 334",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 331,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3363,
            "range": "± 8",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "f3091e72c0705a7b4f6583205237f4bb8c621784",
          "message": "bump version to 0.8.7\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T09:46:00+03:00",
          "tree_id": "f85a4d0023505fc1955597d30f52ad79eb33e8da",
          "url": "https://github.com/Smertig/autoangel-rs/commit/f3091e72c0705a7b4f6583205237f4bb8c621784"
        },
        "date": 1775571389396,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 35561,
            "range": "± 227",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 114,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 71,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 162,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 20085,
            "range": "± 52",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 13500,
            "range": "± 102",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 46,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 290954,
            "range": "± 338",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 310,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3385,
            "range": "± 7",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "2170701a3ce8b3b729b47d5645b8310d6bf6cc7a",
          "message": "pck: hash compressed data in file_entries instead of decompressing\n\n* Avoids decompressing every file just to compute CRC32 hashes\n* Diff consumers can compare compressed hashes first and only\n  decompress on mismatch\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T18:00:39+03:00",
          "tree_id": "10bf3ce4328df561abda7796e41bd43b2076813f",
          "url": "https://github.com/Smertig/autoangel-rs/commit/2170701a3ce8b3b729b47d5645b8310d6bf6cc7a"
        },
        "date": 1775575176020,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 35486,
            "range": "± 118",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 113,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 71,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 161,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 21040,
            "range": "± 109",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 13510,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 46,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 293873,
            "range": "± 8770",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 310,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3416,
            "range": "± 18",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "07c3007e7b5fcb162b5751133884495e986b7e6c",
          "message": "bump version to 0.8.8\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T18:01:58+03:00",
          "tree_id": "098c4abc3f3702e9405cbcc043485644b424bc39",
          "url": "https://github.com/Smertig/autoangel-rs/commit/07c3007e7b5fcb162b5751133884495e986b7e6c"
        },
        "date": 1775575379465,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 31481,
            "range": "± 186",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 115,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 71,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 159,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 20355,
            "range": "± 126",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 13349,
            "range": "± 9",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 46,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 310106,
            "range": "± 265",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 310,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3629,
            "range": "± 2",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "87e32086b6c30f710655c0d8cdee5fd9632fd7f4",
          "message": "async: callback-based DataReader, zero-alloc hot paths\n\n* DataReader::read_at now takes a FnOnce callback instead of &mut [u8],\n  enabling zero-copy processing (hash, write, decompress) directly on\n  the backing store without intermediate allocations\n* Blanket impl for AsRef<[u8]> covers Vec, Mmap, and any contiguous buffer\n* BufferedFileReader calls callback on cached chunk via RefCell::borrow\n* Removes Cow<[u8]>, as_slice, read_bytes_at, get_raw_file_bytes\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-08T12:38:33+03:00",
          "tree_id": "4e5a9ed24c4804853395b0e282b50373dfafebfd",
          "url": "https://github.com/Smertig/autoangel-rs/commit/87e32086b6c30f710655c0d8cdee5fd9632fd7f4"
        },
        "date": 1775641311625,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 31758,
            "range": "± 47",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 148,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 108,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 222,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 16516,
            "range": "± 44",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 28615,
            "range": "± 53",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 66,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 249758,
            "range": "± 334",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 6066,
            "range": "± 14",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 2831,
            "range": "± 1",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "d03a19f0fd012af89aa09c72201e4ea103c17c31",
          "message": "pck: replace file_entries with streaming scan_entries\n\n* scan_entries(paths, on_chunk, interval_ms) streams chunks of\n  FileEntrySummary via callback. Hashes compressed (on-disk) data\n  via CRC32 without decompression\n* paths argument is required (no scan-all mode)\n* Update Python bindings, WASM bindings, type stubs, tests, docs\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-08T07:02:00+03:00",
          "tree_id": "0358b96caf8b1786a128cea97bccffc6aff7b28b",
          "url": "https://github.com/Smertig/autoangel-rs/commit/d03a19f0fd012af89aa09c72201e4ea103c17c31"
        },
        "date": 1775642817440,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 30811,
            "range": "± 322",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 114,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 61,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 167,
            "range": "± 6",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 21668,
            "range": "± 57",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 13698,
            "range": "± 208",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 46,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 283210,
            "range": "± 627",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 308,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3402,
            "range": "± 4",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "5d7fb99b867b4dc3bf29f0f5c6644c7c939a6f14",
          "message": "pck: replace file_entries with streaming scan_entries\n\n* scan_entries(paths, on_chunk, interval_ms) streams chunks of\n  FileEntrySummary via callback. Hashes compressed (on-disk) data\n  via CRC32 without decompression\n* paths argument is required (no scan-all mode)\n* Update Python bindings, WASM bindings, type stubs, tests, docs\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-08T13:13:08+03:00",
          "tree_id": "4ebc29458e424f0b8d913bc4356f347a1f5f8376",
          "url": "https://github.com/Smertig/autoangel-rs/commit/5d7fb99b867b4dc3bf29f0f5c6644c7c939a6f14"
        },
        "date": 1775643613191,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 32145,
            "range": "± 92",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 157,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 108,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 225,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 16427,
            "range": "± 49",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 28527,
            "range": "± 604",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 67,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 249667,
            "range": "± 229",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 6073,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 2921,
            "range": "± 7",
            "unit": "ns/iter"
          }
        ]
      },
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
          "id": "d52ec4c85d685422cb093ea6e289c27b00084ea3",
          "message": "bump version to 0.8.9",
          "timestamp": "2026-04-08T13:13:09+03:00",
          "tree_id": "1599ced8d8da1b1a04a53888eb73dea1598121ec",
          "url": "https://github.com/Smertig/autoangel-rs/commit/d52ec4c85d685422cb093ea6e289c27b00084ea3"
        },
        "date": 1775644098550,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 31616,
            "range": "± 371",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 125,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 62,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 163,
            "range": "± 2",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 24571,
            "range": "± 261",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 13470,
            "range": "± 209",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 47,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 296592,
            "range": "± 1608",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 308,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3405,
            "range": "± 14",
            "unit": "ns/iter"
          }
        ]
      },
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
          "distinct": false,
          "id": "d727d6cd4d317dc3358710202c70522f4254c95d",
          "message": "misc: bump version to 0.9.0\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-08T21:44:02+03:00",
          "tree_id": "e6446c9c58b5cd0134991cedcd1ab6af7087048e",
          "url": "https://github.com/Smertig/autoangel-rs/commit/d727d6cd4d317dc3358710202c70522f4254c95d"
        },
        "date": 1775736722725,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 34791,
            "range": "± 190",
            "unit": "ns/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 113,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::access_fields",
            "value": 62,
            "range": "± 1",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 163,
            "range": "± 5",
            "unit": "ns/iter"
          },
          {
            "name": "Data::write",
            "value": 21413,
            "range": "± 40",
            "unit": "ns/iter"
          },
          {
            "name": "Data::iterate_lists",
            "value": 12967,
            "range": "± 180",
            "unit": "ns/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 47,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 295651,
            "range": "± 227",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::find_prefix",
            "value": 310,
            "range": "± 0",
            "unit": "ns/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 3447,
            "range": "± 20",
            "unit": "ns/iter"
          }
        ]
      }
    ],
    "Rust Benchmark (Memory)": [
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
        "date": 1775330167322,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "e5aaab87c4b09eb1edac6721c718d83c151c71e5",
          "message": "docs [pck]: show errors in a dismissible banner below header\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-05T12:19:46+03:00",
          "tree_id": "091b91d0755855acc213514e2d7138f511335e50",
          "url": "https://github.com/Smertig/autoangel-rs/commit/e5aaab87c4b09eb1edac6721c718d83c151c71e5"
        },
        "date": 1775382096203,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "bc2c681f4f261f055842904e0e833bfde82e8f9d",
          "message": "docs: add custom config panel and error banner to elements viewer\n\n* Config panel supports paste, file picker, and drag-drop of .cfg files\n\n* Parse errors shown in a dismissible banner below header (both viewers)\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-05T14:51:22+03:00",
          "tree_id": "09a4705252ce218120e59a3c147331c94804e7a6",
          "url": "https://github.com/Smertig/autoangel-rs/commit/bc2c681f4f261f055842904e0e833bfde82e8f9d"
        },
        "date": 1775390429577,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "5e7bf98183709d98bec2a12419b5b85d3ec86d4b",
          "message": "bump version to 0.8.1\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-05T15:32:02+03:00",
          "tree_id": "8470eb49ef8786a4db4c066a6e439e5799a7f65c",
          "url": "https://github.com/Smertig/autoangel-rs/commit/5e7bf98183709d98bec2a12419b5b85d3ec86d4b"
        },
        "date": 1775392595589,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "8172fd2152efc85034fb671e3163d966f2f1f1ab",
          "message": "misc: fix formatting",
          "timestamp": "2026-04-05T19:55:06+03:00",
          "tree_id": "aecdab46ae6b98be5462f8cf7502c208bbcc2145",
          "url": "https://github.com/Smertig/autoangel-rs/commit/8172fd2152efc85034fb671e3163d966f2f1f1ab"
        },
        "date": 1775409487228,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "fb6082741808dce069c8f839d216c6e543813e38",
          "message": "bump version to 0.8.2\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-05T21:58:36+03:00",
          "tree_id": "0d55a5f3177792f1cdc1f0fe277cde1ea718b7b9",
          "url": "https://github.com/Smertig/autoangel-rs/commit/fb6082741808dce069c8f839d216c6e543813e38"
        },
        "date": 1775415684937,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "c8893ae848c17cb33815d96a2b8ef74a9a0b4878",
          "message": "docs: add no-cache dev server for local WASM testing\n\nReplaces `python -m http.server` which uses heuristic caching,\ncausing stale WASM files to be served after rebuilds.\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-06T09:24:50+03:00",
          "tree_id": "332065e5e61b10c72f90717a7164867579bc54ad",
          "url": "https://github.com/Smertig/autoangel-rs/commit/c8893ae848c17cb33815d96a2b8ef74a9a0b4878"
        },
        "date": 1775468154993,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "bd75c451ea1261daf577b49ca60e1b84a0b0c255",
          "message": "multi-pkx [wasm, docs]: merge open/open2, update demos\n\nCloses #2\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-06T21:33:45+03:00",
          "tree_id": "281ac7778cb230df88b794841625c40dc1714d1d",
          "url": "https://github.com/Smertig/autoangel-rs/commit/bd75c451ea1261daf577b49ca60e1b84a0b0c255"
        },
        "date": 1775500632645,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "7e25b12864452a78187096bc7421cce0480108d5",
          "message": "docs: add stale .venv troubleshooting note to CLAUDE.md\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-06T21:49:31+03:00",
          "tree_id": "6e5f1d5e2de598ec042dac9af6b62d522b02b8fa",
          "url": "https://github.com/Smertig/autoangel-rs/commit/7e25b12864452a78187096bc7421cce0480108d5"
        },
        "date": 1775501593206,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "abbd72dbf8b5a762c319a36b257ff643200317d3",
          "message": "bump version to 0.8.4\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-06T21:49:31+03:00",
          "tree_id": "cab2fe92a83425646f0fc9bb864b325ffe69bbe9",
          "url": "https://github.com/Smertig/autoangel-rs/commit/abbd72dbf8b5a762c319a36b257ff643200317d3"
        },
        "date": 1775501712946,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "7dd96f8ccdd18e50689f06bdcb1134f518b55180",
          "message": "pck: add on_progress callback with throttling for package parsing\n\n* Callback reports (index, total) for each file entry during parse, with optional time-based throttling via progress_interval_ms (default 0 = no throttling); first and last entries always reported\n\n* Exposed in Python (read_pck/read_pck_bytes on_progress + progress_interval_ms kwargs) and WASM (onProgress + progressIntervalMs in options bag)\n\n* Added web-time dependency for cross-platform Instant (native + WASM)\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T00:50:33+03:00",
          "tree_id": "84308aacb4c83ab03acf1f406604f6909af61146",
          "url": "https://github.com/Smertig/autoangel-rs/commit/7dd96f8ccdd18e50689f06bdcb1134f518b55180"
        },
        "date": 1775547693939,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "19b17cba0a0ee70fb50b7afbf293756180c5cbad",
          "message": "bump version to 0.8.5",
          "timestamp": "2026-04-07T00:53:05+03:00",
          "tree_id": "5903cecff41b5558b58c19714eff1c2c14a4f8d4",
          "url": "https://github.com/Smertig/autoangel-rs/commit/19b17cba0a0ee70fb50b7afbf293756180c5cbad"
        },
        "date": 1775547829187,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 32,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 204,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501248,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 4,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71607,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1166599,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 76343,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 864922,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10776,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "a923ff3705073499ca99b743b80791698a426851",
          "message": "async: make DataReader async and DataSource generic\n\n* DataReader::read_at is now async fn, DataSource<R> uses static dispatch via generics\n\n* New BufferedFileReader reads JS File objects with 4MB read-ahead buffer\n\n* Python API stays sync via pollster::block_on at pyo3 boundaries\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T15:09:42+03:00",
          "tree_id": "7da151cb98773335931ed16426a4beddfa44dfd4",
          "url": "https://github.com/Smertig/autoangel-rs/commit/a923ff3705073499ca99b743b80791698a426851"
        },
        "date": 1775565129200,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1726823,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75655,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 861690,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "bd48d7882f03867e027b2c96a29ffdcde7b0cb0d",
          "message": "async: make DataReader async and DataSource generic\n\n* DataReader::read_at is now async fn, DataSource<R> uses static dispatch via generics\n\n* New BufferedFileReader reads JS File objects with 4MB read-ahead buffer\n\n* Python API stays sync via pollster::block_on at pyo3 boundaries\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T15:35:02+03:00",
          "tree_id": "5090ca97a4e4cc5e6d3521320dae732643340118",
          "url": "https://github.com/Smertig/autoangel-rs/commit/bd48d7882f03867e027b2c96a29ffdcde7b0cb0d"
        },
        "date": 1775565667795,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1726823,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75655,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 861690,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "44dffbb6fb07fda30335402f5aa9003791da8089",
          "message": "bump version to 0.8.6",
          "timestamp": "2026-04-07T07:21:53+03:00",
          "tree_id": "cfb453d441f7d02c213e74a0372d67a0f2204601",
          "url": "https://github.com/Smertig/autoangel-rs/commit/44dffbb6fb07fda30335402f5aa9003791da8089"
        },
        "date": 1775565878041,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1726823,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75655,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 861690,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "82ed66d6ec39c4c3931e137dc18d6d5216a95287",
          "message": "docs: accept .pkx1-.pkx5 extensions in file pickers\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T09:44:00+03:00",
          "tree_id": "a21afe2aec0c7af2e5f7e8cea9b0c36988adb6a6",
          "url": "https://github.com/Smertig/autoangel-rs/commit/82ed66d6ec39c4c3931e137dc18d6d5216a95287"
        },
        "date": 1775570800206,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1726823,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75655,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 861690,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "f3091e72c0705a7b4f6583205237f4bb8c621784",
          "message": "bump version to 0.8.7\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T09:46:00+03:00",
          "tree_id": "f85a4d0023505fc1955597d30f52ad79eb33e8da",
          "url": "https://github.com/Smertig/autoangel-rs/commit/f3091e72c0705a7b4f6583205237f4bb8c621784"
        },
        "date": 1775571390844,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1726823,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75655,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 861690,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "2170701a3ce8b3b729b47d5645b8310d6bf6cc7a",
          "message": "pck: hash compressed data in file_entries instead of decompressing\n\n* Avoids decompressing every file just to compute CRC32 hashes\n* Diff consumers can compare compressed hashes first and only\n  decompress on mismatch\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T18:00:39+03:00",
          "tree_id": "10bf3ce4328df561abda7796e41bd43b2076813f",
          "url": "https://github.com/Smertig/autoangel-rs/commit/2170701a3ce8b3b729b47d5645b8310d6bf6cc7a"
        },
        "date": 1775575177540,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1726823,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75655,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 861690,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "07c3007e7b5fcb162b5751133884495e986b7e6c",
          "message": "bump version to 0.8.8\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-07T18:01:58+03:00",
          "tree_id": "098c4abc3f3702e9405cbcc043485644b424bc39",
          "url": "https://github.com/Smertig/autoangel-rs/commit/07c3007e7b5fcb162b5751133884495e986b7e6c"
        },
        "date": 1775575380381,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 1726823,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75655,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 861690,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "87e32086b6c30f710655c0d8cdee5fd9632fd7f4",
          "message": "async: callback-based DataReader, zero-alloc hot paths\n\n* DataReader::read_at now takes a FnOnce callback instead of &mut [u8],\n  enabling zero-copy processing (hash, write, decompress) directly on\n  the backing store without intermediate allocations\n* Blanket impl for AsRef<[u8]> covers Vec, Mmap, and any contiguous buffer\n* BufferedFileReader calls callback on cached chunk via RefCell::borrow\n* Removes Cow<[u8]>, as_slice, read_bytes_at, get_raw_file_bytes\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-08T12:38:33+03:00",
          "tree_id": "4e5a9ed24c4804853395b0e282b50373dfafebfd",
          "url": "https://github.com/Smertig/autoangel-rs/commit/87e32086b6c30f710655c0d8cdee5fd9632fd7f4"
        },
        "date": 1775641312998,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 2038239,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75723,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 865807,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "d03a19f0fd012af89aa09c72201e4ea103c17c31",
          "message": "pck: replace file_entries with streaming scan_entries\n\n* scan_entries(paths, on_chunk, interval_ms) streams chunks of\n  FileEntrySummary via callback. Hashes compressed (on-disk) data\n  via CRC32 without decompression\n* paths argument is required (no scan-all mode)\n* Update Python bindings, WASM bindings, type stubs, tests, docs\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-08T07:02:00+03:00",
          "tree_id": "0358b96caf8b1786a128cea97bccffc6aff7b28b",
          "url": "https://github.com/Smertig/autoangel-rs/commit/d03a19f0fd012af89aa09c72201e4ea103c17c31"
        },
        "date": 1775642818767,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 2038239,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75723,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 865807,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "5d7fb99b867b4dc3bf29f0f5c6644c7c939a6f14",
          "message": "pck: replace file_entries with streaming scan_entries\n\n* scan_entries(paths, on_chunk, interval_ms) streams chunks of\n  FileEntrySummary via callback. Hashes compressed (on-disk) data\n  via CRC32 without decompression\n* paths argument is required (no scan-all mode)\n* Update Python bindings, WASM bindings, type stubs, tests, docs\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
          "timestamp": "2026-04-08T13:13:08+03:00",
          "tree_id": "4ebc29458e424f0b8d913bc4356f347a1f5f8376",
          "url": "https://github.com/Smertig/autoangel-rs/commit/5d7fb99b867b4dc3bf29f0f5c6644c7c939a6f14"
        },
        "date": 1775643614649,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 2038239,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75723,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 865807,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      },
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
          "id": "d52ec4c85d685422cb093ea6e289c27b00084ea3",
          "message": "bump version to 0.8.9",
          "timestamp": "2026-04-08T13:13:09+03:00",
          "tree_id": "1599ced8d8da1b1a04a53888eb73dea1598121ec",
          "url": "https://github.com/Smertig/autoangel-rs/commit/d52ec4c85d685422cb093ea6e289c27b00084ea3"
        },
        "date": 1775644099600,
        "tool": "cargo",
        "benches": [
          {
            "name": "DataView::parse",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::find_entry",
            "value": 64,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::deep_clone",
            "value": 236,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data::write",
            "value": 501280,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "DataEntry::modify_field",
            "value": 36,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/allocated",
            "value": 71639,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [just parsed]/retained",
            "value": 58279,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/allocated",
            "value": 2038239,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + iterated]/retained",
            "value": 774647,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/allocated",
            "value": 75723,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "Data [parsed + 3 searches]/retained",
            "value": 62103,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::parse",
            "value": 865807,
            "range": "± 0",
            "unit": "bytes/iter"
          },
          {
            "name": "PackageInfo::get_file",
            "value": 10808,
            "range": "± 0",
            "unit": "bytes/iter"
          }
        ]
      }
    ]
  }
}