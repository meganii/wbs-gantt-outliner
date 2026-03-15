import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Plus, Trash2, X } from 'lucide-react';
import { useTaskStore } from '../store/useTaskStore';

interface ProjectSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProjectSettingsDialog: React.FC<ProjectSettingsDialogProps> = ({ isOpen, onClose }) => {
  const holidays = useTaskStore((state) => state.projectConfig.calendar.holidays);
  const setCalendarHolidays = useTaskStore((state) => state.setCalendarHolidays);
  const [draftHoliday, setDraftHoliday] = useState('');

  const holidayItems = useMemo(
    () => holidays.map((holiday) => ({
      value: holiday,
      label: format(parseISO(holiday), 'yyyy-MM-dd (EEE)'),
    })),
    [holidays]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDraftHoliday('');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleAddHoliday = () => {
    if (!draftHoliday) {
      return;
    }

    setCalendarHolidays([...holidays, draftHoliday]);
    setDraftHoliday('');
  };

  const handleRemoveHoliday = (holiday: string) => {
    setCalendarHolidays(holidays.filter((value) => value !== holiday));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/30 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <CalendarDays size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Project Settings</h2>
              <p className="text-xs text-gray-500">Define non-working holidays for this project calendar.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close project settings"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Holidays</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Added dates are treated as non-working days in the calendar and future schedule calculations.
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-gray-500 shadow-sm">
                {holidays.length} registered
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              <input
                type="date"
                value={draftHoliday}
                onChange={(event) => setDraftHoliday(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddHoliday();
                  }
                }}
                className="h-10 flex-1 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={handleAddHoliday}
                disabled={!draftHoliday}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200"
              >
                <Plus size={16} />
                Add Holiday
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-medium text-gray-900">Registered Dates</h3>
              <span className="text-xs text-gray-400">Saved in project JSON</span>
            </div>

            {holidayItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No holidays registered yet.
              </div>
            ) : (
              <div className="max-h-72 overflow-auto">
                {holidayItems.map((holiday) => (
                  <div
                    key={holiday.value}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-800">{holiday.value}</div>
                      <div className="text-xs text-gray-500">{holiday.label}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveHoliday(holiday.value)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
