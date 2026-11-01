"""Drive only native /plugins commands in an isolated Kimi TUI; no model prompts."""
import errno
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import termios
import time

executable, old, new, work = sys.argv[1:]
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
process = subprocess.Popen([executable], stdin=slave, stdout=slave, stderr=slave,
                           cwd=os.path.join(work, "project"), env=dict(os.environ), start_new_session=True)
os.close(slave)
output = bytearray()
steps = []
registry = os.path.join(os.environ["KIMI_CODE_HOME"], "plugins", "installed.json")


def text(offset=0):
    value = output[offset:].decode("utf-8", "replace")
    return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07", "", value)


def wait(predicate, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        if select.select([master], [], [], .1)[0]:
            try:
                chunk = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not chunk:
                break
            output.extend(chunk)
    raise RuntimeError("Native TUI timeout/exited: " + text()[-5000:])


def send(value):
    os.write(master, value.encode())


def drain(duration=.6):
    deadline = time.monotonic() + duration
    while time.monotonic() < deadline:
        if select.select([master], [], [], .05)[0]:
            output.extend(os.read(master, 65536))


def command(value):
    drain()
    offset = len(output)
    send(value)
    # A separate Enter avoids the terminal treating a whole pasted command as a newline.
    drain()
    send("\r")
    return offset


def installed():
    if not os.path.exists(registry):
        return None
    with open(registry) as handle:
        return next((p for p in json.load(handle)["plugins"] if p["id"] == "zcode-memory"), None)


def record(action):
    item = installed()
    version = None
    if item:
        with open(os.path.join(item["root"], "kimi.plugin.json")) as handle:
            version = json.load(handle)["version"]
    steps.append(dict(action=action, registry=item, version=version))
    return item


def install(source):
    start = command("/plugins install " + source)
    wait(lambda: "Trust and install" in text(start))
    # The fixture is this repository's complete plugin. Review its real trust prompt;
    # select the native confirmation instead of setting any trust/auto-approve flag.
    assert "third-party plugin" in text(start)
    send("\x1b[B")
    time.sleep(.2)
    send("\r")
    wait(lambda: "Install finished" in text(start) and
         ("Installed ZCode Memory" in text(start) or "Updated ZCode Memory" in text(start)))


try:
    wait(lambda: "Trust this folder?" in text() or "/help: show commands" in text())
    if "Trust this folder?" in text():
        assert "No project integrations or instructions to activate" in text()
        send("\r")  # normal trust review of the isolated, empty fixture project
    wait(lambda: "synthetic" in text() and "No session yet" in text())
    install(old)
    assert record("install")["enabled"] is True
    for action, enabled in [("enable", True), ("disable", False), ("enable", True), ("disable", False)]:
        start = command("/plugins " + action + " zcode-memory")
        wait(lambda: ("Enabled" if enabled else "Disabled") + " zcode-memory" in text(start))
        assert record(action)["enabled"] is enabled
    command('/plugins mcp disable zcode-memory zcode_memory')
    wait(lambda: installed().get('capabilities', {}).get('mcpServers', {}).get('zcode_memory', {}).get('enabled') is False)
    record('disable-native-mcp-capability')
    install(new)
    assert record("update-while-disabled")["enabled"] is False
    assert steps[-1]["version"] == "0.3.0"
    assert installed()['capabilities']['mcpServers']['zcode_memory']['enabled'] is False
    start = command("/plugins info zcode-memory")
    wait(lambda: "0.3.0" in text(start))
    start = command("/plugins install " + os.path.join(work, "missing-plugin"))
    wait(lambda: "Trust and install" in text(start))
    send("\x1b[B")
    time.sleep(.2)
    send("\r")
    wait(lambda: "failed" in text(start).lower() or "not found" in text(start).lower())
    assert record("failed-install-preserves-state")["enabled"] is False
    start = command("/plugins enable zcode-memory")
    wait(lambda: "Enabled zcode-memory" in text(start))
    assert record("enable-updated")["enabled"] is True
    start = command("/plugins remove zcode-memory")
    wait(lambda: installed() is None or "Remove" in text(start))
    if installed() is not None:
        assert "Remove ZCode Memory (zcode-memory)?" in text(start)
        wait(lambda: "Remove plugin" in text(start))
        send("\x1b[B")
        drain(.2)
        send("\r")
        wait(lambda: installed() is None)
    record("remove")
    print(json.dumps(dict(status="passed", steps=steps, modelCalls=0, nativeTrustConfirmation=True)))
finally:
    process.send_signal(signal.SIGINT)
    time.sleep(.2)
    if process.poll() is None:
        process.send_signal(signal.SIGINT)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
    os.close(master)
    with open(os.path.join(work, "tui-output.log"), "wb") as handle:
        handle.write(output)
