import sys
import os

# Ensure the backend directory is on the path so `import main` resolves
# correctly regardless of where pytest is invoked from (local or CI).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
