insert into books (id, series_id, book_number, title)
values
  ('red-rising-3', 'red-rising', 3, 'Morning Star'),
  ('red-rising-4', 'red-rising', 4, 'Iron Gold'),
  ('red-rising-5', 'red-rising', 5, 'Dark Age'),
  ('red-rising-6', 'red-rising', 6, 'Light Bringer')
on conflict (id) do nothing;
