// ============================================================
// SahakariSIP — SVG Chart Library
// ============================================================
// Recharts is DOM-only, so the mobile app ships its own lightweight
// SVG chart set built on react-native-svg. The API is intentionally
// close to the Recharts usage in the web app (labels + series, optional
// dashed lines, area fill, touch tooltip) so the same data shapes work
// unchanged.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Pressable, type LayoutChangeEvent } from "react-native";
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
  if (max <= 0) return Math.max(minTop, 10);
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

export const LineChart = React.memo(function LineChart({
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
  selectedIndex,
  onSelectPoint,
}: BaseChartProps & {
  showTooltip?: boolean;
  showLegend?: boolean;
  selectedIndex?: number | null;
  onSelectPoint?: (index: number | null) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [internalActiveIndex, setInternalActiveIndex] = useState<number | null>(null);

  const activeIndex = selectedIndex !== undefined ? selectedIndex : internalActiveIndex;

  useEffect(() => {
    if (activeIndex !== null) {
      const timer = setTimeout(() => {
        setInternalActiveIndex(null);
        onSelectPoint?.(null);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeIndex, onSelectPoint]);

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
    const idx = stepX > 0 ? Math.round(relative / stepX) : 0;
    const clamped = Math.max(0, Math.min(labels.length - 1, idx));
    setInternalActiveIndex(clamped);
    onSelectPoint?.(clamped);
  };

  const tooltipLeft = activeIndex !== null ? padLeft + stepX * activeIndex : 0;

  // Check if we have both Portfolio Value and Total Invested for Return calculation
  const hasReturnBreakdown =
    activeIndex !== null &&
    series.length >= 2 &&
    series[0].values[activeIndex] !== null &&
    series[1].values[activeIndex] !== null;

  const returnVal = hasReturnBreakdown && activeIndex !== null
    ? (series[0].values[activeIndex] as number) - (series[1].values[activeIndex] as number)
    : 0;

  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      {width > 0 && (
        <View
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => true}
          onResponderGrant={(e) => handleTouch(e.nativeEvent.locationX)}
          onResponderMove={(e) => handleTouch(e.nativeEvent.locationX)}
          onResponderRelease={() => {
            // Touch release keeps the active index until auto-dismiss after 5s!
          }}
          onResponderTerminate={() => {}}
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
                  <Stop offset="1" stopColor={s.color} stopOpacity="0.2" />
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
                        r={activeIndex === i ? 5 : 3}
                        fill={s.color}
                        stroke={activeIndex === i ? colors.card : undefined}
                        strokeWidth={activeIndex === i ? 2 : 0}
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
                stroke={colors.primary}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.8}
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
            top: 6,
            left: Math.max(
              8,
              Math.min(
                width - 225,
                tooltipLeft - 105
              )
            ),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.xl,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            minWidth: series.length > 1 ? 215 : 165,
            shadowColor: "transparent",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
          }}
        >
          <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700", fontSize: 13, marginBottom: 6 }}>
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
                  gap: spacing.lg,
                  marginVertical: 3,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: s.color,
                    }}
                  />
                  <Text variant="caption" color={colors.foreground} style={{ fontWeight: "600", fontSize: 13 }}>
                    {s.name}:
                  </Text>
                </View>
                <Text
                  variant="caption"
                  color={s.color}
                  style={{ fontWeight: "800", fontSize: 13, flexShrink: 0 }}
                  numberOfLines={1}
                  tabular
                >
                  {formatTooltipY ? formatTooltipY(v) : v.toFixed(0)}
                </Text>
              </View>
            );
          })}

          {hasReturnBreakdown ? (
            <>
              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  marginVertical: spacing.xs + 2,
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.lg,
                }}
              >
                <Text variant="caption" color={colors.foreground} style={{ fontWeight: "700", fontSize: 13 }}>
                  Return:
                </Text>
                <Text
                  variant="caption"
                  color={returnVal >= 0 ? colors.success : colors.rose}
                  style={{ fontWeight: "800", fontSize: 13, flexShrink: 0 }}
                  numberOfLines={1}
                  tabular
                >
                  {returnVal >= 0 ? "+" : ""}
                  {formatTooltipY ? formatTooltipY(returnVal) : returnVal.toFixed(0)}
                </Text>
              </View>
            </>
          ) : null}
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
});

// ------------------------------------------------------------
// Bar chart
// ------------------------------------------------------------

export const BarChart = React.memo(function BarChart({
  labels,
  series,
  height = 220,
  formatY,
  formatTooltipY,
  formatX,
  onSelectPoint,
}: BaseChartProps & { onSelectPoint?: (index: number | null) => void }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeIndex !== null) {
      const timer = setTimeout(() => {
        setActiveIndex(null);
        onSelectPoint?.(null);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeIndex, onSelectPoint]);

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
  const activeBarX = activeIndex !== null ? PAD_LEFT + slot * activeIndex + slot / 2 : 0;

  const handleBarTouch = (locationX: number) => {
    if (n === 0) return;
    const relative = locationX - PAD_LEFT;
    const idx = slot > 0 ? Math.floor(relative / slot) : 0;
    const clamped = Math.max(0, Math.min(n - 1, idx));
    setActiveIndex(clamped);
    onSelectPoint?.(clamped);
  };

  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      {width > 0 && (
        <View
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => true}
          onResponderGrant={(e) => handleBarTouch(e.nativeEvent.locationX)}
          onResponderMove={(e) => handleBarTouch(e.nativeEvent.locationX)}
          onResponderRelease={() => {}}
          onResponderTerminate={() => {}}
        >
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
        </View>
      )}

      {activeIndex !== null && series[0]?.values[activeIndex] != null && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 6,
            left: Math.max(8, Math.min(width - 185, activeBarX - 80)),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.xl,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            minWidth: 175,
            shadowColor: "transparent",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
          }}
        >
          <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700", fontSize: 13, marginBottom: 4 }}>
            {formatX ? formatX(labels[activeIndex]) : labels[activeIndex]}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg, marginTop: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: series[0].color }} />
              <Text variant="caption" color={colors.foreground} style={{ fontWeight: "600", fontSize: 13 }}>
                Contribution:
              </Text>
            </View>
            <Text
              variant="caption"
              color={series[0].color}
              style={{ fontWeight: "800", fontSize: 13, flexShrink: 0 }}
              numberOfLines={1}
              tabular
            >
              {formatTooltipY
                ? formatTooltipY(series[0].values[activeIndex] as number)
                : (series[0].values[activeIndex] as number).toFixed(0)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

// ------------------------------------------------------------
// Donut / Pie chart
// ------------------------------------------------------------

export interface PieSlice {
  name: string;
  value: number;
  color: string;
}

export const DonutChart = React.memo(function DonutChart({
  slices,
  size = 180,
  thickness = 26,
  centerLabel,
  centerValue,
  selectedIndex,
  onSelectSlice,
}: {
  slices: PieSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  selectedIndex?: number | null;
  onSelectSlice?: (index: number | null) => void;
}) {
  const { colors } = useTheme();
  const [internalActiveIndex, setInternalActiveIndex] = useState<number | null>(null);
  const activeIndex = selectedIndex !== undefined ? selectedIndex : internalActiveIndex;

  useEffect(() => {
    if (activeIndex !== null) {
      const timer = setTimeout(() => {
        setInternalActiveIndex(null);
        onSelectSlice?.(null);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeIndex, onSelectSlice]);

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
      .map((s, originalIndex) => {
        const sweep = (s.value / total) * Math.PI * 2;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        return { ...s, start, end, originalIndex };
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

  const activeSlice = activeIndex !== null && slices[activeIndex] ? slices[activeIndex] : null;
  const displayVal = activeSlice
    ? `${((activeSlice.value / (total || 1)) * 100).toFixed(0)}%`
    : centerValue;
  const displayLabel = activeSlice ? activeSlice.name : centerLabel;

  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        {arcs.map((a) => {
          const isActive = activeIndex === a.originalIndex;
          return (
            <Path
              key={a.originalIndex}
              d={describeArc(a.start, a.end)}
              fill={a.color}
              opacity={activeIndex === null || isActive ? 1 : 0.45}
              onPress={() => {
                const next = activeIndex === a.originalIndex ? null : a.originalIndex;
                setInternalActiveIndex(next);
                onSelectSlice?.(next);
              }}
            />
          );
        })}
        <Circle cx={cx} cy={cy} r={radiusInner - 1} fill={colors.card} />
      </Svg>
      {(displayVal || displayLabel) && (
        <View
          style={{
            position: "absolute",
            alignItems: "center",
            justifyContent: "center",
            width: radiusInner * 2,
            height: radiusInner * 2,
          }}
        >
          {displayVal ? (
            <Text
              variant="label"
              style={{ fontSize: fontSize.md, fontWeight: "800", color: activeSlice?.color }}
              numberOfLines={1}
            >
              {displayVal}
            </Text>
          ) : null}
          {displayLabel ? (
            <Text variant="caption" color={colors.mutedForeground} align="center" style={{ fontSize: 10 }}>
              {displayLabel}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
});

/** Legend list used next to the donut. */
export function ChartLegend({
  items,
  formatValue,
  selectedIndex,
  onSelectSlice,
}: {
  items: PieSlice[];
  formatValue?: (value: number) => string;
  selectedIndex?: number | null;
  onSelectSlice?: (index: number | null) => void;
}) {
  const { colors } = useTheme();
  const total = items.reduce((s, i) => s + i.value, 0);

  return (
    <View style={{ gap: spacing.sm, flex: 1 }}>
      {items.map((item, idx) => {
        const isActive = selectedIndex === idx;
        return (
          <Pressable
            key={item.name}
            onPress={() => onSelectSlice?.(isActive ? null : idx)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
              opacity: selectedIndex === null || isActive ? 1 : 0.45,
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
              <Text variant="caption" color={isActive ? item.color : colors.mutedForeground} numberOfLines={1} style={{ fontWeight: isActive ? "700" : "400" }}>
                {item.name}
              </Text>
            </View>
            <Text variant="caption" style={{ fontWeight: "700" }} color={isActive ? item.color : colors.foreground} tabular>
              {formatValue
                ? formatValue(item.value)
                : `${((item.value / (total || 1)) * 100).toFixed(0)}%`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
