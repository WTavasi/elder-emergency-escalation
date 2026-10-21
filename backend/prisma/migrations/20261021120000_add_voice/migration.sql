-- Talking in the app during an emergency. Every join is audited; nothing said is kept.
ALTER TYPE "audit_action" ADD VALUE 'VOICE_JOINED' AFTER 'ARRIVED';
