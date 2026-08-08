DROP VIEW "public"."user_reliability";--> statement-breakpoint
CREATE VIEW "public"."user_reliability" AS (select
  u.id,
  count(*) filter (where c.status = 'completed') as completed,
  count(*) filter (where c.status = 'no_show')   as no_shows
from users u
left join claims c on c.user_id = u.id
group by u.id);