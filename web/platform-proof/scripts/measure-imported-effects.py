"""Measure the local development proof process tree on systems with resource.getrusage."""
import json
import os
from pathlib import Path
import platform
import resource
import subprocess
import sys
import time

repo = Path(__file__).resolve().parents[3]
output = Path(os.environ.get('ORK_EFFECTS_OUTPUT', repo / 'web/platform-proof/build/imported-effects')).resolve()
output.mkdir(parents=True, exist_ok=True)
env = dict(os.environ, ORK_EFFECTS_OUTPUT=str(output))
started = time.monotonic()
with (output / 'process-runner.log').open('w') as log:
    result = subprocess.run(['node', str(repo / 'web/platform-proof/scripts/imported-effects-proof.mjs')],
                            cwd=repo, env=env, stdout=log, stderr=log)
usage = resource.getrusage(resource.RUSAGE_CHILDREN)
report = {
    'kind': 'OS RUSAGE_CHILDREN for the local development runner process tree, including javac/JVM/Vitest/workerd; not request CPU or isolate heap',
    'platform': platform.system(), 'wallSeconds': time.monotonic() - started,
    'userCpuSeconds': usage.ru_utime, 'systemCpuSeconds': usage.ru_stime,
    'maximumProcessRss': usage.ru_maxrss,
    'maximumProcessRssUnit': 'KiB' if platform.system() == 'Linux' else 'OS-dependent',
    'exitCode': result.returncode, 'hostedCpu': None, 'isolateHeap': None,
}
(output / 'local-process.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
sys.exit(result.returncode)
