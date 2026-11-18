"""Measure the local development proof child tree on systems with os.wait4."""
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time

repo = Path(__file__).resolve().parents[3]
output = Path(os.environ.get('ORK_EFFECTS_OUTPUT', repo / 'web/platform-proof/build/imported-effects')).resolve()
output.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, ORK_EFFECTS_OUTPUT=str(output))
started = time.monotonic()
with (output / 'process-runner.log').open('w') as log:
    # Aggregate RUSAGE_CHILDREN can include children reaped before a shell exec.
    # wait4 reports this runner child and its waited-for descendants specifically.
    with subprocess.Popen(['node', str(repo / 'web/platform-proof/scripts/imported-effects-proof.mjs')],
                          cwd=repo, env=env, stdout=log, stderr=log) as child:
        _, status, usage = os.wait4(child.pid, 0)
        child.returncode = os.waitstatus_to_exitcode(status)
        returncode = child.returncode
report = {
    'kind': 'OS wait4 for the Node runner child and waited-for descendants, including javac/JVM/Vitest/workerd; not request CPU or isolate heap',
    'platform': platform.system(), 'wallSeconds': time.monotonic() - started,
    'userCpuSeconds': usage.ru_utime, 'systemCpuSeconds': usage.ru_stime,
    'maximumProcessRss': usage.ru_maxrss,
    'maximumProcessRssUnit': 'KiB' if platform.system() == 'Linux' else 'OS-dependent',
    'exitCode': returncode, 'hostedCpu': None, 'isolateHeap': None,
}
(output / 'local-process.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
sys.exit(returncode)
