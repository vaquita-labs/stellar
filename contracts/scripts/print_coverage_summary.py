#!/usr/bin/env python3
"""Pretty-print `cargo llvm-cov report --json --summary-only` for terminal preview."""
import json
import sys

def main() -> None:
    data = json.load(sys.stdin).get("data") or []
    print()
    print("Coverage summary (preview — same metrics as coverage-html/html/index.html)")
    print("-" * 72)
    for block in data:
        for f in block.get("files") or []:
            s = f["summary"]
            print(f"  {f['filename']}")
            print(
                f"    Functions: {s['functions']['covered']}/{s['functions']['count']} "
                f"({s['functions']['percent']:.2f}%)"
            )
            print(
                f"    Lines:     {s['lines']['covered']}/{s['lines']['count']} "
                f"({s['lines']['percent']:.2f}%)"
            )
            print(
                f"    Regions:   {s['regions']['covered']}/{s['regions']['count']} "
                f"({s['regions']['percent']:.2f}%)"
            )
            br = s.get("branches") or {}
            if br.get("count", 0) > 0:
                print(
                    f"    Branches:  {br.get('covered', 0)}/{br['count']} "
                    f"({br.get('percent', 0):.2f}%)"
                )
        t = block.get("totals")
        if t:
            print("  ---")
            print(
                f"  TOTAL  Functions: {t['functions']['covered']}/{t['functions']['count']} "
                f"({t['functions']['percent']:.2f}%)"
            )
            print(
                f"         Lines:     {t['lines']['covered']}/{t['lines']['count']} "
                f"({t['lines']['percent']:.2f}%)"
            )
            print(
                f"         Regions:   {t['regions']['covered']}/{t['regions']['count']} "
                f"({t['regions']['percent']:.2f}%)"
            )
    print("-" * 72)
    print("Open HTML: open coverage-html/html/index.html")
    print()


if __name__ == "__main__":
    try:
        main()
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Could not parse coverage JSON: {e}", file=sys.stderr)
        sys.exit(1)
