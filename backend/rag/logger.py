"""
Custom logger setup for the entire RAG application.
"""

import logging
import sys

def setup_logger(name: str) -> logging.Logger:
    """
    Creates a logger with a given name, sets level, and defines
    a stream handler for console output.
    """
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)  # Set the minimum log level here

    # Check if logger already has handlers (avoid duplicates)
    if not logger.handlers:
        ch = logging.StreamHandler(sys.stdout)  # Console output
        ch.setLevel(logging.DEBUG)

        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        ch.setFormatter(formatter)
        logger.addHandler(ch)

    return logger
