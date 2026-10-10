import * as React from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: date =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex gap-4 flex-col md:flex-row relative",
          defaultClassNames.months
        ),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute bg-popover inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-full h-full p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md group/day aspect-square select-none",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-md bg-accent",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        today: cn(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          );
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            );
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            );
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          );
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  children,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const isDarkDay = Boolean(modifiers.darkDay || modifiers.darkday);
  const isRangePending = Boolean(modifiers.rangePending || modifiers.rangepending);
  const isRangeStart = Boolean(modifiers.range_start || modifiers.rangeStart);
  const isRangeEnd = Boolean(modifiers.range_end || modifiers.rangeEnd);
  const isRangeMiddle = Boolean(modifiers.range_middle || modifiers.rangeMiddle);
  const isSingle = Boolean(modifiers.selected && !isRangeStart && !isRangeEnd && !isRangeMiddle && !isRangePending);
  const isMappingSelected = Boolean(modifiers.mappingSelected);
  const mappingOrderKey = Object.keys(modifiers).find(key => key.startsWith("mappingOrder") && modifiers[key]);
  const mappingOrder = mappingOrderKey?.replace("mappingOrder", "");
  const isSavedLog = Boolean(modifiers.savedLog);

  // KPI Heatmap modifiers
  const isKpiWithin = Boolean(modifiers.kpiWithin || modifiers.kpi_within);
  const isKpiLightRed = Boolean(modifiers.kpiLightRed || modifiers.kpi_light_red);
  const isKpiDarkRed = Boolean(modifiers.kpiDarkRed || modifiers.kpi_dark_red);
  const isKpiDeepRed = Boolean(modifiers.kpiDeepRed || modifiers.kpi_deep_red);
  const isNoLog = Boolean(modifiers.noLog || modifiers.nolog);

  // Standard severity fallback (if used elsewhere)
  const severity = modifiers.critical ? "critical" : modifiers.high ? "high" : modifiers.elevated ? "elevated" : modifiers.monitor ? "monitor" : undefined;
  const severityClass = severity === "critical" ? "!bg-rose-400 !text-white hover:!bg-rose-500" : severity === "high" ? "!bg-amber-400 !text-slate-900 hover:!bg-amber-500" : severity === "elevated" ? "!bg-yellow-300 !text-slate-900 hover:!bg-yellow-400" : severity === "monitor" ? "!bg-blue-400 !text-white hover:!bg-blue-500" : "";

  // Tooltip content extraction from modifier keys like tooltip_...
  const tooltipKey = Object.keys(modifiers).find(key => key.startsWith("tooltip_") && modifiers[key]);
  let tooltipText = tooltipKey ? decodeURIComponent(tooltipKey.replace("tooltip_", "")) : undefined;

  if (isDarkDay && !tooltipText) {
    tooltipText = "Dark day";
  } else if (isNoLog && !tooltipText) {
    tooltipText = "No log detected";
  }

  const buttonElement = (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-dark-day={isDarkDay}
      data-range-pending={isRangePending}
      data-selected-single={isSingle}
      data-range-start={isRangeStart}
      data-range-end={isRangeEnd}
      data-range-middle={isRangeMiddle}
      data-mapping-selected={isMappingSelected}
      data-saved-log={isSavedLog}
      className={cn(
        "relative flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] transition-all [&>span]:text-xs",
        isSingle && !isMappingSelected && !severity && "!bg-[#3D52A0] !text-white font-bold !rounded-lg shadow-sm hover:!bg-[#293252]",
        isMappingSelected && "!bg-emerald-700 !text-white font-extrabold !rounded-lg shadow-sm hover:!bg-emerald-800",
        isRangeStart && "!bg-[#3D52A0] !text-white font-extrabold !rounded-l-lg !rounded-r-none shadow-sm z-10 hover:!bg-[#293252]",
        isRangeEnd && "!bg-[#3D52A0] !text-white font-extrabold !rounded-r-lg !rounded-l-none shadow-sm z-10 hover:!bg-[#293252]",
        isRangeMiddle && "!bg-indigo-100/90 !text-[#293252] font-semibold !rounded-none hover:!bg-indigo-200",
        isRangePending && "!bg-amber-500 !text-white font-extrabold ring-2 ring-amber-400 ring-offset-1 !rounded-lg shadow-md animate-pulse",
        // KPI Heatmap coloring (0%-0.99% blue, 1%-1.99% light red, 2%-2.99% darker red, >=3% deep red)
        isKpiWithin && !isDarkDay && "!bg-[#5793f5] !text-white font-extrabold shadow-sm hover:!bg-[#3d7be0]",
        isKpiLightRed && !isDarkDay && "!bg-[#ff7b89] !text-white font-extrabold shadow-sm hover:!bg-[#f06272]",
        isKpiDarkRed && !isDarkDay && "!bg-[#e03a52] !text-white font-extrabold shadow-sm hover:!bg-[#c8253c]",
        isKpiDeepRed && !isDarkDay && "!bg-[#9e0c24] !text-white font-extrabold shadow-sm hover:!bg-[#82071c]",
        // No log detected (slightly lighter grey than dark day)
        isNoLog && !isDarkDay && "!bg-slate-200 !text-slate-400 hover:!bg-slate-200 hover:!text-slate-500 border border-slate-300/60",
        // Legacy severity
        severity && !isDarkDay && `!ring-2 !ring-blue-100 !ring-offset-1 font-extrabold shadow-sm ${severityClass}`,
        // Dark day grey
        isDarkDay && "!bg-slate-400 !text-slate-900 hover:!bg-slate-400 hover:!text-slate-950 font-extrabold border border-slate-500 shadow-inner",
        defaultClassNames.day,
        className
      )}
      {...props}
    >
      {children}
      {mappingOrder && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border border-white bg-sky-600 text-[9px] font-extrabold leading-none text-white shadow-sm"
        >
          {mappingOrder}
        </span>
      )}
      {isSavedLog && !isMappingSelected && (
        <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-sky-500" />
      )}
    </Button>
  );

  if (tooltipText) {
    return (
      <TooltipProvider delayDuration={50}>
        <Tooltip>
          <TooltipTrigger asChild>
            {buttonElement}
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-slate-900 text-white font-semibold text-xs px-2.5 py-1 z-50 shadow-md">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return buttonElement;
}

export { Calendar, CalendarDayButton };
