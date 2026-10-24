"""Compare unchanged regression programs with one or two processes per runner."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def cpu_ticks():
    values = [int(value) for value in Path("/proc/stat").read_text().splitlines()[0].split()[1:9]]
    return sum(values), values[3] + values[4]


def memory():
    values = {line.split(":")[0]: int(line.split()[1]) for line in Path("/proc/meminfo").read_text().splitlines()}
    return values["MemTotal"], values["MemTotal"] - values["MemAvailable"]


def main():
    group, workers, shard = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    assert group in ("unit", "browser") and workers in (1, 2) and 1 <= shard <= 4
    evidence = Path(".artifacts/regression")
    evidence.mkdir(parents=True, exist_ok=True)
    processes = []
    logs = []

    def cancel(signum, frame):
        for process in processes:
            if process.poll() is None:
                process.send_signal(signum)
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, cancel)
    signal.signal(signal.SIGINT, cancel)
    inventory = json.loads(Path("test/regression-manifest.json").read_text())[group]
    expected = inventory[shard - 1::4]
    planned = [inventory[shard + 4 * worker - 1::4 * workers] for worker in range(workers)]
    assert sorted(sum(planned, [])) == sorted(expected)
    started = time.monotonic()
    initial_cpu = cpu_ticks()
    samples = []
    exit_codes = []
    try:
        for worker in range(workers):
            coordinates = f"{shard + 4 * worker}/{4 * workers}"
            log = (evidence / f"worker-{worker + 1}.log").open("w")
            logs.append(log)
            processes.append(subprocess.Popen(
                ["node", "test/regression-runner.ts", group, "--shard=" + coordinates],
                stdout=log, stderr=subprocess.STDOUT,
            ))
        while True:
            total_memory, used_memory = memory()
            samples.append({"seconds": round(time.monotonic() - started, 3), "used_memory_kib": used_memory})
            if all(process.poll() is not None for process in processes):
                break
            time.sleep(1)
        exit_codes = [process.wait() for process in processes]
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=12)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for log in logs:
            log.close()
    final_cpu = cpu_ticks()
    total_delta = final_cpu[0] - initial_cpu[0]
    idle_delta = final_cpu[1] - initial_cpu[1]
    records = []
    for worker in range(workers):
        result_path = evidence / "runner" / f"{group}-{shard + 4 * worker}-of-{4 * workers}" / f"{group}-results.json"
        if result_path.exists():
            records.extend(json.loads(result_path.read_text()))
    covered = sorted(record["test"] for record in records) == sorted(expected)
    report = {
        "group": group, "workers": workers, "shard": shard,
        "seconds": round(time.monotonic() - started, 3),
        "cpu_count": os.cpu_count(),
        "host_cpu_busy_percent": round(100 * (1 - idle_delta / total_delta), 2) if total_delta else None,
        "host_memory_total_kib": total_memory,
        "host_memory_peak_used_kib": max(sample["used_memory_kib"] for sample in samples),
        "expected_cases": len(expected), "completed_cases": len(records),
        "passed_cases": sum(record["passed"] for record in records),
        "exact_coverage": covered, "exit_codes": exit_codes,
        "failures": [record["test"] for record in records if not record["passed"]],
        "samples": samples,
    }
    (evidence / "benchmark.json").write_text(json.dumps(report, indent=2) + "\n")
    summary = {key: value for key, value in report.items() if key != "samples"}
    print(json.dumps(summary, indent=2), flush=True)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
            output.write("```json\n" + json.dumps(summary, indent=2) + "\n```\n")
    return 0 if covered and all(code == 0 for code in exit_codes) else 1


if __name__ == "__main__":
    sys.exit(main())
