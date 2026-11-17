"""Local-only runner guard tests; no Docker or database operations executed."""
import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("runner", Path(__file__).with_name("run_i01_followups.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class LocalGuardTests(unittest.TestCase):
    def check_guard(self, env, context="desktop-linux", endpoint="npipe:////./pipe/docker_engine", address="unix-socket"):
        with patch.dict(os.environ, env, clear=True), patch.object(runner, "call", side_effect=[context, endpoint]) as call, patch.object(runner, "sql", return_value=address) as sql:
            runner.assert_local_target()
            self.assertEqual(call.call_count, 2)
            sql.assert_called_once()

    def test_local_desktop_and_unix_contexts(self):
        self.check_guard({})
        self.check_guard({"DOCKER_HOST": "unix:///var/run/docker.sock"}, "default", "unix:///var/run/docker.sock")

    def test_remote_host_rejected_before_docker(self):
        for host in ["tcp://remote:2376", "ssh://remote", "tcp://127.0.0.1:2375"]:
            with self.subTest(host=host), patch.dict(os.environ, {"DOCKER_HOST": host}, clear=True), patch.object(runner, "call") as call:
                with self.assertRaises(RuntimeError):
                    runner.assert_local_target()
                call.assert_not_called()

    def test_remote_context_env_rejected_before_docker(self):
        with patch.dict(os.environ, {"DOCKER_CONTEXT": "production"}, clear=True), patch.object(runner, "call") as call:
            with self.assertRaises(RuntimeError):
                runner.assert_local_target()
            call.assert_not_called()

    def test_remote_current_context_and_reconfigured_local_name_rejected(self):
        for values in [["production"], ["default", "ssh://remote"], ["desktop-linux", "tcp://remote:2376"]]:
            with self.subTest(values=values), patch.dict(os.environ, {}, clear=True), patch.object(runner, "call", side_effect=values), patch.object(runner, "sql") as sql:
                with self.assertRaises(RuntimeError):
                    runner.assert_local_target()
                sql.assert_not_called()

    def test_remote_database_address_rejected(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(runner, "call", side_effect=["default", "unix:///var/run/docker.sock"]), patch.object(runner, "sql", return_value="10.0.0.2"):
            with self.assertRaises(RuntimeError):
                runner.assert_local_target()


if __name__ == "__main__":
    unittest.main()
