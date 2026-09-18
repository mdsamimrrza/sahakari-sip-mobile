// ============================================================
// SahakariSIP — SVG Chart Library
// ============================================================
// Recharts is DOM-only, so the mobile app ships its own lightweight
// SVG chart set built on react-native-svg. The API is intentionally
// close to the Recharts usage in the web app (labels + series, optional
// dashed lines, area fill, touch tooltip) so the same data shapes work
// unchanged.
// ============================================================

import React, { useMemo, useRef, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { useTheme, spacing, radius, fontSize } from "../../theme";
import { Text } from "../ui/primitives";

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  /** Dashed stroke — used for "Total Invested" and "Projected" lines. */
  dashed?: boolean;
  /** Fill the area under the line with a soft gradient. */
  area?: boolean;
  /** Draw a point marker per data point (auto-suppressed on dense data). */
  dots?: boolean;
  /** Values aligned 1:1 with `labels`. Use null for a gap. */
  values: Array<number | null>;
}

interface BaseChartProps {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  formatY?: (value: number) => string;
  formatTooltipY?: (value: number) => string;
  formatX?: (label: string) => string;
  /** Hide the y axis (used by compact sparkline-ish cards). */
  hideY?: boolean;
  /** Hide the x axis labels. */
  hideX?: boolean;
  /** Minimum y-axis top tick (mirrors the web portfolio chart). */
  minTop?: number;
}

const PAD_LEFT = 46;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;

/** Round a max value up to a "nice" axis top with 3 divisions. */
function niceTop(max: number, minTop = 0): number {
  if (max <= 0) return Math.max(minTop, 1000);
  const raw = Math.max(max * 1.15, minTop);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const stepped =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return stepped * magnitude;
}

function buildTicks(top: number, count = 3): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push((top / count) * i);
  return ticks;
}

// ------------------------------------------------------------
// Line / Area chart
// ------------------------------------------------------------

export function LineChart({
  labels,
  series,
  height = 240,
  formatY,
  formatTooltipY,
  formatX,
  hideY,
  hideX,
  minTop,
  showTooltip = true,
  showLegend = false,
}: BaseChartProps & { showTooltip?: boolean; showLegend?: boolean }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const lastTouch = useRef<{ x: number; y: number } | null>(null);

  const padLeft = hideY ? 8 : PAD_LEFT;
  const padBottom = hideX ? 10 : PAD_BOTTOM;

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const { top, ticks, plotW, plotH, points } = useMemo(() => {
    const allValues = series.flatMap((s) =>
      s.values.filter((v): v is number => v !== null && isFinite(v))
    );
    const maxValue = allValues.length ? Math.max(...allValues) : 0;
    const axisTop = niceTop(maxValue, minTop ?? 0);
    const w = Math.max(width - padLeft - PAD_RIGHT, 1);
    const h = Math.max(height - PAD_TOP - padBottom, 1);

    const n = labels.length;
    const stepX = n > 1 ? w / (n - 1) : 0;

    const pts = series.map((s) =>
      s.values.map((v, i) => {
        if (v === null || !isFinite(v)) return null;
        const x = padLeft + stepX * i;
        const y = PAD_TOP + h - (v / axisTop) * h;
        return { x, y };
      })
    );

    return {
      top: axisTop,
      ticks: buildTicks(axisTop, 3),
      plotW: w,
      plotH: h,
      points: pts,
    };
  }, [labels.length, series, width, height, padLeft, padBottom, minTop]);

  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : 0;

  // Thin out x labels so they never overlap.
  const labelStride = Math.max(1, Math.ceil(labels.length / 5));

  const handleTouch = (locationX: number) => {
    if (!showTooltip || labels.length === 0) return;
    const relative = locationX - padLeft;
    const idx =
      stepX > 0
        ? Math.round(relative / stepX)
        : 0;
    setActiveIndex(Math.max(0, Math.min(labels.length - 1, idx)));
  };

  const tooltipLeft = activeIndex !== null ? padLeft + stepX * activeIndex : 0;

  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      {width > 0 && (
        <View
          onStartShouldSetResponder={(e) => {
            // Record the touch origin; do not claim — claiming every touch
            // would stop the parent ScrollView from scrolling the page.
            lastTouch.current = {
              x: e.nativeEvent.pageX,
              y: e.nativeEvent.pageY,
            };
            return false;
          }}
          onMoveShouldSetResponder={(e) => {
            // Only claim predominantly-horizontal drags (tooltip scrubbing);
            // vertical swipes pass through to the ScrollView.
            if (!showTooltip) return false;
            const cur = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
            const prev = lastTouch.current;
            lastTouch.current = cur;
            if (!prev) return false;
            const dx = Math.abs(cur.x - prev.x);
            const dy = Math.abs(cur.y - prev.y);
            return dx > dy * 1.4 && dx > 10;
          }}
          onResponderGrant={(e) => handleTouch(e.nativeEvent.locationX)}
          onResponderMove={(e) => handleTouch(e.nativeEvent.locationX)}
          onResponderRelease={() => setActiveIndex(null)}
        >
          <Svg width={width} height={height}>
            <Defs>
              {series.map((s) => (
                <LinearGradient
                  key={`grad-${s.key}`}
                  id={`grad-${s.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor={s.color} stopOpacity="0.32" />
                  <Stop offset="1" stopColor={s.color} stopOpacity="0.02" />
                </LinearGradient>
              ))}
            </Defs>

            {/* Horizontal grid + y ticks */}
            {ticks.map((t, i) => {
              const y = PAD_TOP + plotH - (t / top) * plotH;
              return (
                <G key={`tick-${i}`}>
                  <Line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + plotW}
                    y2={y}
                    stroke={colors.chartGrid}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.6}
                  />
                  {!hideY && (
                    <SvgText
                      x={padLeft - 8}
                      y={y + 4}
                      fill={colors.chartText}
                      fontSize={10}
                      textAnchor="end"
                    >
                      {formatY ? formatY(t) : Math.round(t).toString()}
                    </SvgText>
                  )}
                </G>
              );
            })}

            {/* Series */}
            {series.map((s, sIdx) => {
              const pts = points[sIdx];
              const valid = pts.filter((p): p is { x: number; y: number } => !!p);
              if (valid.length === 0) return null;

              const path = valid
                .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
                .join(" ");

              const areaPath =
                s.area && valid.length > 1
                  ? `${path} L${valid[valid.length - 1].x},${
                      PAD_TOP + plotH
                    } L${valid[0].x},${PAD_TOP + plotH} Z`
                  : null;

              return (
                <G key={s.key}>
                  {areaPath ? (
                    <Path d={areaPath} fill={`url(#grad-${s.key})`} />
                  ) : null}
                  <Path
                    d={path}
                    stroke={s.color}
                    strokeWidth={s.area ? 2 : 2.5}
                    strokeDasharray={s.dashed ? "6 4" : undefined}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {(s.dots ?? valid.length <= 15) &&
                    valid.map((p, i) => (
                      <Circle
                        key={`${s.key}-dot-${i}`}
                        cx={p.x}
                        cy={p.y}
                        r={3}
                        fill={s.color}
                      />
                    ))}
                </G>
              );
            })}

            {/* Active marker */}
            {activeIndex !== null && (
              <Line
                x1={tooltipLeft}
                y1={PAD_TOP}
                x2={tooltipLeft}
                y2={PAD_TOP + plotH}
                stroke={colors.mutedForeground}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.7}
              />
            )}

            {/* X labels */}
            {!hideX &&
              labels.map((label, i) => {
                if (i % labelStride !== 0 && i !== labels.length - 1) return null;
                return (
                  <SvgText
                    key={`x-${i}`}
                    x={padLeft + stepX * i}
                    y={height - 8}
                    fill={colors.chartText}
                    fontSize={10}
                    textAnchor="middle"
                  >
                    {formatX ? formatX(label) : label}
                  </SvgText>
                );
              })}
          </Svg>
        </View>
      )}

      {/* Tooltip card */}
      {activeIndex !== null && showTooltip && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 4,
            left: Math.max(
              4,
              Math.min(
                width - 170,
                tooltipLeft - 80
              )
            ),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.sm + 2,
            minWidth: 160,
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
          }}
        >
          <Text variant="caption" color={colors.mutedForeground}>
            {formatX ? formatX(labels[activeIndex]) : labels[activeIndex]}
          </Text>
          {series.map((s) => {
            const v = s.values[activeIndex];
            if (v === null || v === undefined) return null;
            return (
              <View
                key={s.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.sm,
                  marginTop: 3,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: s.color,
                    }}
                  />
                  <Text variant="caption" color={colors.mutedForeground}>
                    {s.name}
                  </Text>
                </View>
                <Text variant="caption" style={{ fontWeight: "800" }} tabular>
                  {formatTooltipY ? formatTooltipY(v) : v.toFixed(0)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {showLegend && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: spacing.md,
            marginTop: spacing.sm,
            paddingLeft: hideY ? 0 : 4,
          }}
        >
          {series.map((s) => (
            <View
              key={`legend-${s.key}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <View
                style={{
                  width: s.dashed ? 14 : 9,
                  height: s.dashed ? 2 : 9,
                  borderRadius: 5,
                  backgroundColor: s.dashed ? "transparent" : s.color,
                  borderTopWidth: s.dashed ? 2 : 0,
                  borderStyle: s.dashed ? "dashed" : "solid",
                  borderColor: s.color,
                }}
              />
              <Text variant="caption" color={colors.mutedForeground}>
                {s.name}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------
// Bar chart
// ------------------------------------------------------------

export function BarChart({
  labels,
  series,
  height = 220,
  formatY,
  formatTooltipY,
  formatX,
}: BaseChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  const { top, ticks, plotW, plotH } = useMemo(() => {
    const allValues = series.flatMap((s) =>
      s.values.filter((v): v is number => v !== null && isFinite(v))
    );
    const maxValue = allValues.length ? Math.max(...allValues) : 0;
    const axisTop = niceTop(maxValue);
    return {
      top: axisTop,
      ticks: buildTicks(axisTop, 3),
      plotW: Math.max(width - PAD_LEFT - PAD_RIGHT, 1),
      plotH: Math.max(height - PAD_TOP - PAD_BOTTOM, 1),
    };
  }, [series, width, height]);

  const n = labels.length;
  const slot = n > 0 ? plotW / n : 0;
  const barWidth = Math.max(4, Math.min(slot * 0.6, 26));
  const labelStride = Math.max(1, Math.ceil(n / 5));

  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {ticks.map((t, i) => {
            const y = PAD_TOP + plotH - (t / top) * plotH;
            return (
              <G key={`btick-${i}`}>
                <Line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={PAD_LEFT + plotW}
                  y2={y}
                  stroke={colors.chartGrid}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <SvgText
                  x={PAD_LEFT - 8}
                  y={y + 4}
                  fill={colors.chartText}
                  fontSize={9}
                  textAnchor="end"
                >
                  {formatY ? formatY(t) : Math.round(t).toString()}
                </SvgText>
              </G>
            );
          })}

          {labels.map((label, i) => {
            const value = series[0]?.values[i] ?? null;
            if (value === null || !isFinite(value)) return null;
            const barH = Math.max(1, (value / top) * plotH);
            const x = PAD_LEFT + slot * i + (slot - barWidth) / 2;
            const y = PAD_TOP + plotH - barH;
            const isActive = activeIndex === i;
            return (
              <G key={`bar-${i}`}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={4}
                  fill={series[0].color}
                  opacity={activeIndex === null || isActive ? 1 : 0.45}
                  onPressIn={() => setActiveIndex(i)}
                />
              </G>
            );
          })}

          {labels.map((label, i) => {
            if (i % labelStride !== 0 && i !== n - 1) return null;
            return (
              <SvgText
                key={`bx-${i}`}
                x={PAD_LEFT + slot * i + slot / 2}
                y={height - 8}
                fill={colors.chartText}
                fontSize={9}
                textAnchor="middle"
              >
                {formatX ? formatX(label) : label}
              </SvgText>
            );
          })}
        </Svg>
      )}

      {activeIndex !== null && series[0]?.values[activeIndex] != null && (
        <View
          style={{
            position: "absolute",
            top: 4,
            left: 48,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.sm + 2,
            paddingVertical: spacing.sm,
          }}
        >
          <Text variant="caption" color={colors.mutedForeground}>
            {formatX ? formatX(labels[activeIndex]) : labels[activeIndex]}
          </Text>
          <Text variant="caption" style={{ fontWeight: "800" }} tabular>
            {formatTooltipY
              ? formatTooltipY(series[0].values[activeIndex] as number)
              : (series[0].values[activeIndex] as number).toFixed(0)}
          </Text>
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------
// Donut / Pie chart
// ------------------------------------------------------------

export interface PieSlice {
  name: string;
  value: number;
  color: string;
}

export function DonutChart({
  slices,
  size = 180,
  thickness = 26,
  centerLabel,
  centerValue,
}: {
  slices: PieSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const { colors } = useTheme();
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radiusOuter = size / 2;
  const radiusInner = radiusOuter - thickness;
  const cx = radiusOuter;
  const cy = radiusOuter;

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let angle = -Math.PI / 2;
    return slices
      .filter((s) => s.value > 0)
      .map((s) => {
        const sweep = (s.value / total) * Math.PI * 2;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        return { ...s, start, end };
      });
  }, [slices, total]);

  const describeArc = (start: number, end: number) => {
    const x1 = cx + radiusOuter * Math.cos(start);
    const y1 = cy + radiusOuter * Math.sin(start);
    const x2 = cx + radiusOuter * Math.cos(end);
    const y2 = cy + radiusOuter * Math.sin(end);
    const x3 = cx + radiusInner * Math.cos(end);
    const y3 = cy + radiusInner * Math.sin(end);
    const x4 = cx + radiusInner * Math.cos(start);
    const y4 = cy + radiusInner * Math.sin(start);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return [
      `M${x1},${y1}`,
      `A${radiusOuter},${radiusOuter} 0 ${largeArc} 1 ${x2},${y2}`,
      `L${x3},${y3}`,
      `A${radiusInner},${radiusInner} 0 ${largeArc} 0 ${x4},${y4}`,
      "Z",
    ].join(" ");
  };

  if (total <= 0) {
    return (
      <View
        style={{
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text variant="caption" color={colors.mutedForeground}>
          No data yet
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        {arcs.map((a, i) => (
          <Path key={i} d={describeArc(a.start, a.end)} fill={a.color} />
        ))}
        <Circle cx={cx} cy={cy} r={radiusInner - 1} fill={colors.card} />
      </Svg>
      {(centerValue || centerLabel) && (
        <View
          style={{
            position: "absolute",
            alignItems: "center",
            justifyContent: "center",
            width: radiusInner * 2,
            height: radiusInner * 2,
          }}
        >
          {centerValue ? (
            <Text
              variant="label"
              style={{ fontSize: fontSize.md, fontWeight: "800" }}
              numberOfLines={1}
            >
              {centerValue}
            </Text>
          ) : null}
          {centerLabel ? (
            <Text variant="caption" color={colors.mutedForeground}>
              {centerLabel}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Legend list used next to the donut. */
export function ChartLegend({
  items,
  formatValue,
}: {
  items: PieSlice[];
  formatValue?: (value: number) => string;
}) {
  const { colors } = useTheme();
  const total = items.reduce((s, i) => s + i.value, 0);

  return (
    <View style={{ gap: spacing.sm, flex: 1 }}>
      {items.map((item) => (
        <View
          key={item.name}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: item.color,
              }}
            />
            <Text variant="caption" color={colors.mutedForeground} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <Text variant="caption" style={{ fontWeight: "700" }} tabular>
            {formatValue
              ? formatValue(item.value)
              : `${((item.value / (total || 1)) * 100).toFixed(0)}%`}
          </Text>
        </View>
      ))}
    </View>
  );
}
