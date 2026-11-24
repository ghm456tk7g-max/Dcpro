"""Startpunkt für den Autodarts AI Coach."""

import logging
import sys

from autodarts_coach.paths import LOG_PATH


def main():
    logging.basicConfig(filename=LOG_PATH, level=logging.INFO, encoding="utf-8",
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    selftest = "--selftest" in sys.argv
    try:
        from autodarts_coach.gui import App
        App(selftest=selftest).mainloop()
    except Exception:
        logging.exception("Absturz beim Start")
        if selftest:
            sys.exit(1)
        raise


if __name__ == "__main__":
    main()
