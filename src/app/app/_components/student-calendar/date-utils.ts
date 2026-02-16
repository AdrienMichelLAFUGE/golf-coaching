export const DAY_MS = 24 * 60 * 60 * 1000;

export const startOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

export const endOfDay = (value: Date) => {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
};

export const startOfMonth = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);

export const endOfMonth = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);

export const addMonths = (value: Date, offset: number) =>
  new Date(value.getFullYear(), value.getMonth() + offset, 1, 0, 0, 0, 0);

export const addDays = (value: Date, offset: number) => {
  const next = new Date(value);
  next.setDate(next.getDate() + offset);
  return next;
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const isSameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export const toDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map((item) => Number(item));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const buildMonthGrid = (monthDate: Date) => {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  const gridStart = new Date(monthStart);
  const dayOfWeek = monthStart.getDay();
  const mondayFirstOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  gridStart.setDate(monthStart.getDate() - mondayFirstOffset);

  const gridEnd = new Date(monthEnd);
  const endDayOfWeek = monthEnd.getDay();
  const endOffset = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
  gridEnd.setDate(monthEnd.getDate() + endOffset);

  const days: Date[] = [];
  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = new Date(cursor.getTime() + DAY_MS)) {
    days.push(new Date(cursor));
  }

  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
};

export const toDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toDateTimeInputValue = (value: Date) => {
  const datePart = toDateInputValue(value);
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${datePart}T${hours}:${minutes}`;
};

export const parseDateInputToIso = (value: string) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const parseDateTimeInputToIso = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};
