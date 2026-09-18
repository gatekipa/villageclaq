-- STOP teardown note only. Do NOT delete/pause disposable.
-- Poison already cleaned by repair-safety on 00121 HOLD.
-- Residue: 00118-00120 applied+repaired; 00121 objects may exist without history row.
-- No further DROP/repair executed by this requalification (founder STOP rule).
SELECT 'stop_teardown_note_only'::text AS note;
