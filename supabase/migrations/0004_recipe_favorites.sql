-- Decouple "favorite" (personal collection, used to bias menu generation and
-- populate "Mis favoritas") from "vote" (public like/dislike rating shown on
-- every recipe). A recipe can now be liked/disliked without being a favorite,
-- and favorited without ever being rated. See lib/recipeVotes.js.
alter table recipe_votes alter column vote drop not null;
alter table recipe_votes drop constraint if exists recipe_votes_vote_check;
alter table recipe_votes add constraint recipe_votes_vote_check
  check (vote is null or vote in ('up', 'down'));

alter table recipe_votes add column if not exists is_favorite boolean not null default false;

comment on column recipe_votes.vote is 'Public like/dislike rating, independent of favoriting.';
comment on column recipe_votes.is_favorite is 'Personal favorite flag (saved to "Mis favoritas" / usable in menu generation).';
comment on column recipe_votes.scope is 'Menu-group scope of the favorite (NULL = whole household). Meaningless when is_favorite = false.';
