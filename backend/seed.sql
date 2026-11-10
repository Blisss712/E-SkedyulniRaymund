insert into public.organizations (id, name, description, contact_email, phone, timezone, address, category, status, created_at)
values
('st-joseph', 'St. Joseph Parish', 'A welcoming parish community serving local families and ministries.', 'office@stjoseph.example', '(02) 8123 4567', 'Asia/Manila', '24 Mabini Street, Quezon City', 'Parish', 'active', '2026-07-12T00:00:00+08:00'),
('holy-family', 'Holy Family Chapel', 'Community chapel coordinating worship and outreach programs.', 'admin@holyfamily.example', '(02) 8456 7890', 'Asia/Manila', '18 Sampaguita Road, Makati City', 'Chapel', 'active', '2026-08-03T00:00:00+08:00'),
('sacred-heart', 'Sacred Heart Community', 'Faith community supporting youth and neighborhood programs.', 'hello@sacredheart.example', '(02) 8789 0123', 'Asia/Manila', '7 Rizal Avenue, Pasig City', 'Community', 'inactive', '2026-05-18T00:00:00+08:00')
on conflict (id) do nothing;

insert into public.events (id, organization_id, title, description, starts_at, ends_at, location, capacity, registration_deadline, visibility, recurrence, repeat_until, status, created_at)
values
('sunday-mass', 'st-joseph', 'Sunday Mass', 'Weekly parish celebration with assigned liturgical ministries.', '2026-10-04T09:00:00+08:00', '2026-10-04T10:30:00+08:00', 'Main Church', 240, '2026-10-03T18:00:00+08:00', 'public', 'weekly', '2026-12-27T00:00:00+08:00', 'published', '2026-09-10T00:00:00+08:00'),
('choir-rehearsal', 'st-joseph', 'Choir Rehearsal', 'Final rehearsal for the Sunday liturgy.', '2026-10-03T17:00:00+08:00', '2026-10-03T19:00:00+08:00', 'Parish Hall', 40, '2026-10-02T17:00:00+08:00', 'members', 'weekly', '2026-12-19T00:00:00+08:00', 'published', '2026-09-11T00:00:00+08:00'),
('youth-assembly', 'holy-family', 'Youth Ministry Assembly', 'Monthly formation and planning session.', '2026-10-10T14:00:00+08:00', '2026-10-10T16:00:00+08:00', 'Formation Room', 60, '2026-10-09T12:00:00+08:00', 'members', 'monthly', '2027-03-13T00:00:00+08:00', 'draft', '2026-09-22T00:00:00+08:00')
on conflict (id) do nothing;
