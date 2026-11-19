"""Compare author PDF plot coordinates with the already extracted Senoo ED4 XLS data."""

from hashlib import sha256
import json
from pathlib import Path
import sys

import pdfplumber


FIGURE = Path(__file__).resolve().parents[1] / 'references/library/171yb/yb-senoo-author-edfig4-v1-v2.pdf'
FIGURE_SHA256 = 'e12b84ab44d1e88c565d2eee3f436eb918c04ce0582b406c6595572919c7107b'
ED4_SHA256 = '3d9b826aebf68aa42e68a58cda041e85fd3884814bd1faf5320e17f574b7938a'
AXIS_COLOR = (0.2, 0.2, 0.2)


def compare_panel(page, points, bounds, marker_color, error_color, y_tick_left, y_bottom):
    # PDF coordinates use a top-left origin. Both main plots have 0, 5, 10 µs ticks and a 0–1 vertical scale.
    left, right, top, bottom = bounds
    axes = [line for line in page.lines if line['stroking_color'] == AXIS_COLOR]
    x_ticks = sorted(line['x0'] for line in axes if left < line['x0'] < right
                     and abs(line['top'] - y_bottom) < 0.001 and abs(line['height'] - 2) < 0.001
                     and line['width'] == 0)
    y_ticks = [line['top'] for line in axes if abs(line['x0'] - y_tick_left) < 0.001
               and top < line['top'] < bottom and line['height'] == 0]
    if len(x_ticks) != 3 or len(y_ticks) != 6:
        raise ValueError('Unexpected axis tick layout')
    x0, _, x10 = x_ticks
    y1, y0 = min(y_ticks), max(y_ticks)

    markers = sorted(((curve['x0'] + curve['x1']) / 2, (curve['top'] + curve['bottom']) / 2)
                     for curve in page.curves if left < curve['x0'] < right and top < curve['top'] < bottom
                     and curve['fill'] and curve['non_stroking_color'] == marker_color
                     and abs(curve['width'] - 1) < 0.01 and abs(curve['height'] - 1) < 0.01)
    bars = sorted((line['x0'], line['top'], line['bottom']) for line in page.lines
                  if left < line['x0'] < right and top < line['top'] < bottom
                  and line['width'] == 0 and line['stroking_color'] == error_color)
    if len(markers) != len(bars) or len(markers) != len(points) or len(points) != 60:
        raise ValueError('Expected 60 workbook observations, 60 vector markers and 60 bars')

    deviations = {'timeUs': [], 'population': [], 'lowerEndpoint': [], 'upperEndpoint': []}
    for point, (x, y), (bar_x, bar_top, bar_bottom) in zip(points, markers, bars, strict=True):
        if abs(x - bar_x) >= 0.004:
            raise ValueError(f"Unmatched error bar at {point['cells']}")
        plotted_time = (x - x0) * 10 / (x10 - x0)
        plotted_population = (y0 - y) / (y0 - y1)
        plotted_lower = (y0 - bar_bottom) / (y0 - y1)
        plotted_upper = (y0 - bar_top) / (y0 - y1)
        population = point['population']
        deviations['timeUs'].append(abs(plotted_time - point['timeUs']))
        deviations['population'].append(abs(plotted_population - population))
        deviations['lowerEndpoint'].append(abs(plotted_lower - (population - point['lowerError'])))
        deviations['upperEndpoint'].append(abs(plotted_upper - (population + point['upperError'])))
    return {'points': len(points), 'maxAbsoluteDeviation': {key: max(values) for key, values in deviations.items()}}


def main():
    data = json.load(sys.stdin)
    if data['ed4Sha256'] != ED4_SHA256 or sha256(FIGURE.read_bytes()).hexdigest() != FIGURE_SHA256:
        raise ValueError('Unexpected Senoo ED4 PDF or XLS archive SHA-256')
    with pdfplumber.open(FIGURE) as document:
        page = document.pages[0]
        panels = {
            '4e': compare_panel(page, data['singleAtom'], (44, 118, 153, 221),
                                (1.0, 0.560784, 0.690196), (0.74902, 0.419608, 0.509804), 41.648, 220.34),
            '4f': compare_panel(page, data['blockade'], (267, 341, 153, 220),
                                (1.0, 0.67451, 0.560784), (0.74902, 0.509804, 0.419608), 264.254, 219.848),
        }
    print(json.dumps(panels, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
