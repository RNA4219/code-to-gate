import json


class Service:
    def run(self) -> str:
        return json.dumps({"ok": True})


def main() -> str:
    return Service().run()
