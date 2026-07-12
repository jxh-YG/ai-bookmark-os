// ===== 轻量级 SVG 图表库（增强版：大字、hover tooltip、交互高亮） =====
const SimpleCharts = {
  tooltipEl: null,

  init(container) {
    if (!container) return { svg: null, container: null };
    container.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.display = 'block';
    svg.style.overflow = 'visible';
    container.appendChild(svg);
    return { svg, container };
  },

  createEl(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) el.setAttribute(k, v);
    }
    return el;
  },

  getColors() {
    const style = getComputedStyle(document.body);
    return {
      text: style.getPropertyValue('--text-secondary').trim() || '#5f6368',
      line: style.getPropertyValue('--border-medium').trim() || '#dadce0',
      accent: style.getPropertyValue('--accent').trim() || '#1a73e8',
      grid: style.getPropertyValue('--border-light').trim() || '#e8eaed',
      bg: style.getPropertyValue('--bg-primary').trim() || '#ffffff'
    };
  },

  ensureTooltip() {
    if (this.tooltipEl) return this.tooltipEl;
    const el = document.createElement('div');
    el.className = 'simple-chart-tooltip';
    el.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      background: rgba(32, 33, 36, 0.92);
      color: #fff;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      line-height: 1.4;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 120ms ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(el);
    this.tooltipEl = el;
    return el;
  },

  showTooltip(text, x, y) {
    const tip = this.ensureTooltip();
    tip.innerHTML = text;
    tip.style.opacity = '1';
    this.moveTooltip(x, y);
  },

  moveTooltip(x, y) {
    const tip = this.ensureTooltip();
    const rect = tip.getBoundingClientRect();
    let left = x + 12;
    let top = y - rect.height - 8;
    if (left + rect.width > window.innerWidth) left = x - rect.width - 12;
    if (top < 0) top = y + 12;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  },

  hideTooltip() {
    if (this.tooltipEl) this.tooltipEl.style.opacity = '0';
  },

  bindTooltip(el, html, container) {
    el.addEventListener('mouseenter', (e) => {
      el.style.filter = 'brightness(0.92)';
      el.style.cursor = 'pointer';
      const rect = container.getBoundingClientRect();
      this.showTooltip(html, e.clientX, e.clientY);
    });
    el.addEventListener('mousemove', (e) => {
      this.moveTooltip(e.clientX, e.clientY);
    });
    el.addEventListener('mouseleave', () => {
      el.style.filter = 'none';
      this.hideTooltip();
    });
  },

  lineChart(instance, data, options = {}) {
    const { svg, container } = instance;
    if (!svg || !container) return;
    const { title, yLabelFormatter = v => v, showArea = true } = options;
    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width || 600, 300);
    const height = Math.max(rect.height || 280, 260);
    const padding = {
      top: title ? 40 : 16,
      right: 24,
      bottom: title ? 48 : 64,
      left: 56
    };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const colors = this.getColors();

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    if (!data || data.length === 0) {
      const text = this.createEl('text', {
        x: width / 2, y: height / 2,
        'text-anchor': 'middle', fill: colors.text,
        'font-size': '13'
      });
      text.textContent = title || 'No data';
      svg.appendChild(text);
      return;
    }

    const values = data.map(d => d.value);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;

    const slotCount = Math.max(data.length - 1, 6);
    const pointSpacing = chartW / slotCount;
    const occupiedWidth = pointSpacing * (data.length - 1);
    const startX = padding.left + (chartW - occupiedWidth) / 2;
    const getX = i => startX + i * pointSpacing;
    const getY = v => padding.top + chartH - ((v - minValue) / range) * chartH;

    if (title) {
      const t = this.createEl('text', {
        x: padding.left, y: 24,
        fill: colors.text, 'font-size': '14', 'font-weight': '500'
      });
      t.textContent = title;
      svg.appendChild(t);
    }

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = minValue + (range * i) / yTicks;
      const y = getY(v);
      const line = this.createEl('line', {
        x1: padding.left, y1: y, x2: width - padding.right, y2: y,
        stroke: colors.grid, 'stroke-width': 1
      });
      svg.appendChild(line);
      const label = this.createEl('text', {
        x: padding.left - 10, y: y + 5,
        'text-anchor': 'end', fill: colors.text, 'font-size': '11'
      });
      label.textContent = yLabelFormatter(Math.round(v));
      svg.appendChild(label);
    }

    const xTickStep = Math.ceil(data.length / 6);
    data.forEach((d, i) => {
      if (i % xTickStep !== 0 && i !== data.length - 1) return;
      const x = getX(i);
      const label = this.createEl('text', {
        x, y: height - padding.bottom + 10,
        'text-anchor': 'end', fill: colors.text, 'font-size': '11',
        transform: `rotate(-40, ${x}, ${height - padding.bottom + 10})`
      });
      label.textContent = d.label.length > 9 ? d.label.slice(0, 7) + '...' : d.label;
      svg.appendChild(label);
    });

    if (showArea) {
      let areaPath = `M ${getX(0)} ${padding.top + chartH}`;
      data.forEach((d, i) => {
        areaPath += ` L ${getX(i)} ${getY(d.value)}`;
      });
      areaPath += ` L ${getX(data.length - 1)} ${padding.top + chartH} Z`;
      const area = this.createEl('path', {
        d: areaPath, fill: colors.accent, opacity: '0.10'
      });
      svg.appendChild(area);
    }

    let linePath = '';
    data.forEach((d, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      linePath += ` ${cmd} ${getX(i)} ${getY(d.value)}`;
    });
    const path = this.createEl('path', {
      d: linePath, fill: 'none', stroke: colors.accent, 'stroke-width': 2.5,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    svg.appendChild(path);

    const guideLine = this.createEl('line', {
      x1: 0, y1: padding.top,
      x2: 0, y2: padding.top + chartH,
      stroke: colors.text, 'stroke-width': 1, 'stroke-dasharray': '3,3',
      opacity: '0'
    });
    svg.appendChild(guideLine);

    data.forEach((d, i) => {
      const cx = getX(i);
      const cy = getY(d.value);

      const hitArea = this.createEl('circle', {
        cx, cy, r: 12, fill: 'transparent', stroke: 'none'
      });
      svg.appendChild(hitArea);

      const circle = this.createEl('circle', {
        cx, cy, r: 4.5, fill: colors.bg, stroke: colors.accent, 'stroke-width': 2.5
      });
      svg.appendChild(circle);

      this.bindTooltip(hitArea, `<strong>${d.label}</strong><br/>${yLabelFormatter(d.value)}`, container);
      hitArea.addEventListener('mouseenter', () => {
        circle.setAttribute('r', '6.5');
        circle.setAttribute('stroke-width', '3');
        guideLine.setAttribute('x1', cx);
        guideLine.setAttribute('x2', cx);
        guideLine.setAttribute('opacity', '0.3');
        path.setAttribute('stroke-width', '3.5');
      });
      hitArea.addEventListener('mouseleave', () => {
        circle.setAttribute('r', '4.5');
        circle.setAttribute('stroke-width', '2.5');
        guideLine.setAttribute('opacity', '0');
        path.setAttribute('stroke-width', '2.5');
      });
    });
  },

  barChart(instance, data, options = {}) {
    const { svg, container } = instance;
    if (!svg || !container) return;
    const { title, horizontal = false } = options;
    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width || 600, 300);
    const height = Math.max(rect.height || 280, 260);
    const padding = horizontal
      ? { top: title ? 40 : 16, right: 48, bottom: 24, left: 100 }
      : { top: title ? 40 : 16, right: 24, bottom: 72, left: 56 };
    const colors = this.getColors();
    const palette = [colors.accent, '#34a853', '#fbbc04', '#ea4335', '#9334e6', '#ff6d01', '#46bdc6', '#7cb342'];

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    if (!data || data.length === 0) {
      const text = this.createEl('text', {
        x: width / 2, y: height / 2,
        'text-anchor': 'middle', fill: colors.text, 'font-size': '13'
      });
      text.textContent = title || 'No data';
      svg.appendChild(text);
      return;
    }

    if (title) {
      const t = this.createEl('text', {
        x: padding.left, y: 24,
        fill: colors.text, 'font-size': '14', 'font-weight': '500'
      });
      t.textContent = title;
      svg.appendChild(t);
    }

    const maxValue = Math.max(...data.map(d => d.value), 1);

    if (!horizontal) {
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const barGap = Math.min(10, Math.max(3, Math.floor(chartW / data.length / 4)));
      const barW = (chartW - barGap * (data.length - 1)) / data.length;
      const labelStep = Math.ceil(data.length / 8);

      data.forEach((d, i) => {
        const color = d.color || palette[i % palette.length];
        const barH = (d.value / maxValue) * chartH;
        const x = padding.left + i * (barW + barGap);
        const y = padding.top + chartH - barH;
        const rect = this.createEl('rect', {
          x, y, width: Math.max(barW, 1), height: Math.max(barH, 0),
          fill: color, rx: 3
        });
        svg.appendChild(rect);

        if (i % labelStep === 0 || i === data.length - 1) {
          const label = this.createEl('text', {
            x: x + barW / 2, y: height - padding.bottom + 10,
            'text-anchor': 'end', fill: colors.text, 'font-size': '11',
            transform: `rotate(-40, ${x + barW / 2}, ${height - padding.bottom + 10})`
          });
          label.textContent = d.label.length > 9 ? d.label.slice(0, 7) + '...' : d.label;
          svg.appendChild(label);
        }

        if (d.value > 0) {
          const val = this.createEl('text', {
            x: x + barW / 2, y: Math.max(y + 14, padding.top + chartH - 14),
            'text-anchor': 'middle', fill: '#fff', 'font-size': '11', 'font-weight': '500'
          });
          val.textContent = d.value;
          svg.appendChild(val);
        }

        this.bindTooltip(rect, `<strong>${d.label}</strong><br/>${d.value}`, container);
      });
    } else {
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const barGap = Math.min(10, Math.max(4, Math.floor(chartH / data.length / 4)));
      const barH = (chartH - barGap * (data.length - 1)) / data.length;

      data.forEach((d, i) => {
        const color = d.color || palette[i % palette.length];
        const barW = (d.value / maxValue) * chartW;
        const y = padding.top + i * (barH + barGap);
        const rect = this.createEl('rect', {
          x: padding.left, y, width: Math.max(barW, 1), height: Math.max(barH, 0),
          fill: color, rx: 3
        });
        svg.appendChild(rect);

        const label = this.createEl('text', {
          x: padding.left - 10, y: y + barH / 2 + 5,
          'text-anchor': 'end', fill: colors.text, 'font-size': '11'
        });
        label.textContent = d.label.length > 10 ? d.label.slice(0, 8) + '...' : d.label;
        svg.appendChild(label);

        const val = this.createEl('text', {
          x: padding.left + barW + 6, y: y + barH / 2 + 5,
          fill: colors.text, 'font-size': '11', 'font-weight': '500'
        });
        val.textContent = d.value;
        svg.appendChild(val);

        this.bindTooltip(rect, `<strong>${d.label}</strong><br/>${d.value}`, container);
      });
    }
  },

  pieChart(instance, data, options = {}) {
    const { svg, container } = instance;
    if (!svg || !container) return;
    const { title, donut = false } = options;
    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width || 320, 280);
    const height = Math.max(rect.height || 280, 260);
    const colors = this.getColors();
    const topOffset = title ? 6 : -10;
    const palette = [
      '#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9334e6',
      '#ff6d01', '#46bdc6', '#7cb342', '#c0ca33', '#9aa0a6'
    ];

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    if (!data || data.length === 0) {
      const text = this.createEl('text', {
        x: width / 2, y: height / 2,
        'text-anchor': 'middle', fill: colors.text, 'font-size': '13'
      });
      text.textContent = title || 'No data';
      svg.appendChild(text);
      return;
    }

    if (title) {
      const t = this.createEl('text', {
        x: 12, y: 24,
        fill: colors.text, 'font-size': '14', 'font-weight': '500'
      });
      t.textContent = title;
      svg.appendChild(t);
    }

    const total = data.reduce((sum, d) => sum + d.value, 0);
    const cx = width / 2 - 40;
    const cy = height / 2 + topOffset;
    const radius = Math.min(width, height) / 2 - 32;
    const innerRadius = donut ? radius * 0.55 : 0;

    let startAngle = -Math.PI / 2;
    const slices = [];

    data.forEach((d, i) => {
      const angle = (d.value / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const color = d.color || palette[i % palette.length];

      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      const x3 = cx + innerRadius * Math.cos(endAngle);
      const y3 = cy + innerRadius * Math.sin(endAngle);
      const x4 = cx + innerRadius * Math.cos(startAngle);
      const y4 = cy + innerRadius * Math.sin(startAngle);
      const largeArc = angle > Math.PI ? 1 : 0;

      const dPath = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z'
      ].join(' ');

      const path = this.createEl('path', {
        d: dPath, fill: color, stroke: colors.bg, 'stroke-width': 2
      });
      svg.appendChild(path);

      const percent = Math.round((d.value / total) * 100);
      const midAngle = startAngle + angle / 2;
      const ratio = d.value / total;

      if (ratio >= 0.04) {
        const labelR = (radius + innerRadius) / 2;
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);
        const text = this.createEl('text', {
          x: lx, y: ly + 5,
          'text-anchor': 'middle', fill: '#fff', 'font-size': '12', 'font-weight': '600',
          stroke: 'rgba(0,0,0,0.45)', 'stroke-width': '0.8', 'paint-order': 'stroke'
        });
        text.textContent = percent + '%';
        svg.appendChild(text);
      } else if (ratio >= 0.015) {
        const outerR = radius + 14;
        const lx = cx + outerR * Math.cos(midAngle);
        const ly = cy + outerR * Math.sin(midAngle);
        const textAnchor = Math.cos(midAngle) >= 0 ? 'start' : 'end';
        const line = this.createEl('line', {
          x1: cx + radius * Math.cos(midAngle),
          y1: cy + radius * Math.sin(midAngle),
          x2: lx, y2: ly,
          stroke: colors.text, 'stroke-width': 1
        });
        svg.appendChild(line);
        const text = this.createEl('text', {
          x: lx + (textAnchor === 'start' ? 4 : -4), y: ly + 4,
          'text-anchor': textAnchor, fill: colors.text, 'font-size': '11', 'font-weight': '500'
        });
        text.textContent = percent + '%';
        svg.appendChild(text);
      }

      slices.push({ path, data: d, percent, color });
      startAngle = endAngle;
    });

    slices.forEach(({ path, data, percent, color }) => {
      this.bindTooltip(path, `<strong>${data.label}</strong><br/>${data.value} (${percent}%)`, container);
      path.addEventListener('mouseenter', () => {
        path.setAttribute('stroke-width', '5');
        path.style.filter = 'brightness(1.05)';
      });
      path.addEventListener('mouseleave', () => {
        path.setAttribute('stroke-width', '2');
        path.style.filter = 'none';
      });
    });

    // 图例
    const legendX = width - 86;
    let legendY = 36;
    data.slice(0, 8).forEach((d, i) => {
      const color = d.color || palette[i % palette.length];
      const dot = this.createEl('rect', {
        x: legendX, y: legendY, width: 10, height: 10, fill: color, rx: 2
      });
      svg.appendChild(dot);
      const text = this.createEl('text', {
        x: legendX + 16, y: legendY + 9,
        fill: colors.text, 'font-size': '11'
      });
      text.textContent = d.label.length > 9 ? d.label.slice(0, 7) + '...' : d.label;
      svg.appendChild(text);
      legendY += 18;
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimpleCharts;
}
if (typeof self !== 'undefined') {
  self.SimpleCharts = SimpleCharts;
}
