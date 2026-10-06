import React from 'react';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/themes/light.css';

/**
 * DateRangePicker – a thin Flatpickr wrapper kept in its own chunk.
 * It is dynamically imported (React.lazy) by Dashboard so that the
 * Flatpickr bundle (~40KB) is only downloaded when a date-range
 * field is actually opened, keeping the initial app bundle small.
 *
 * Props:
 *   start, end   – Date objects defining the initial range
 *   onChange(s,e) – called with the selected start/end Dates
 *   style        – styles forwarded to the Flatpickr input
 *   placeholder  – input placeholder text
 */
export default function DateRangePicker({ start, end, onChange, style, placeholder }) {
  return (
    <Flatpickr
      options={{ mode: 'range', dateFormat: 'M j, Y', defaultDate: [start, end] }}
      onChange={([s, e]) => { if (s && e) onChange(s, e); }}
      style={style}
      placeholder={placeholder}
    />
  );
}
