"""Bundle the offline game into one portable HTML file using the Python standard library."""
import argparse
import base64
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path, help="destination HTML filename")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text()
cover = base64.b64encode((root / "assets/after-hours.webp").read_bytes()).decode()
style = (root / "game/style.css").read_text().replace("../assets/after-hours.webp", "data:image/webp;base64," + cover)
html = html.replace('<link rel="stylesheet" href="game/style.css">', "<style>\n" + style + "\n</style>")
pattern = r'<script defer src="([^"]+)"></script>'
sources = []
for path in re.findall(pattern, html):
    content = (root / path).read_text().replace("</script", "<\\/script")
    sources.append("<script>\n" + content + "\n</script>")
html = re.sub(pattern, "", html).replace("</body>", "\n".join(sources) + "\n</body>")
args.output.write_text(html)
