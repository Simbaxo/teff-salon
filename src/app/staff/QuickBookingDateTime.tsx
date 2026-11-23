"use client";

import { getStaffTimeOptions } from "@/lib/appointments/staff-scheduling";
import { formatTime } from "./staff-formatters";

type Props = {
  date: string;
  time: string;
  customTime: boolean;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onCustomTimeChange: (custom: boolean) => void;
};

const timeOptions = getStaffTimeOptions();

export default function QuickBookingDateTime({
  date,
  time,
  customTime,
  onDateChange,
  onTimeChange,
  onCustomTimeChange,
}: Props) {
  return (
    <div className="border-t border-neutral-200 pt-5">
      <h3 className="mb-4 text-lg font-semibold text-black">3. Fecha y hora</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="quick-booking-date"
            className="block text-sm font-medium text-black"
          >
            Fecha
          </label>

          <input
            id="quick-booking-date"
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-black"
          />
        </div>

        <div>
          <label
            htmlFor="quick-booking-time"
            className="block text-sm font-medium text-black"
          >
            Hora de inicio
          </label>

          {customTime ? (
            <input
              id="quick-booking-time"
              type="time"
              step={60}
              value={time}
              onChange={(event) => onTimeChange(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-black"
            />
          ) : (
            <select
              id="quick-booking-time"
              value={time}
              onChange={(event) => onTimeChange(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-black"
            >
              {timeOptions.map((option) => (
                <option key={option} value={option}>
                  {formatTime(option)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-medium text-black">
        <input
          type="checkbox"
          checked={customTime}
          onChange={(event) => {
            const custom = event.target.checked;
            onCustomTimeChange(custom);

            if (!custom && !timeOptions.includes(time)) {
              onTimeChange("10:00");
            }
          }}
          className="h-5 w-5 accent-[#B76E79]"
        />
        Hora personalizada
      </label>

      <p className="mt-2 text-xs text-neutral-600">
        Los horarios fuera de la jornada habitual requieren confirmación. Las
        citas que se superpongan también mostrarán una advertencia.
      </p>
    </div>
  );
}
