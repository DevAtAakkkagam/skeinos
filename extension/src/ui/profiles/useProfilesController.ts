// The Profiles tab's view-model (the profile-library analog of `usePromptsController`).
// It wraps the worker-backed `useProfileLibrary` (injectable for tests) and owns the
// modal-editor UI state plus the create/update/delete + seed-install seams. Like the
// prompts controller it holds NO authoritative profile state — every mutation drives
// the client and the view reconciles via the `profiles` broadcast (observe-don't-
// replay), so the list and editor can never disagree with the worker's truth.

import { useCallback, useEffect, useState } from 'preact/hooks';
import type { InstructionProfile } from '../../shared/types';
import type { DomainId } from '../../shared/domains';
import { installProfileSeedsRemote } from '../../core/profiles';
import { quotaDetailOf, type QuotaErrorDetail } from '../../core/tier';
import type { ProfileEditorSubmit } from './ProfileEditor';
import {
  makeProfileId,
  useProfileLibrary,
  type ProfileLibraryStatus,
  type ProfileLibraryView,
} from './useProfileLibrary';

export interface ProfilesController {
  // --- data (passthrough from the library view) -------------------------------
  profiles: InstructionProfile[];
  status: ProfileLibraryStatus;
  retry: () => void;

  // --- editor (modal, mirrors the prompt editor) ------------------------------
  editorOpen: boolean;
  editing: InstructionProfile | undefined;
  openCreate: () => void;
  openEdit: (p: InstructionProfile) => void;
  closeEditor: () => void;
  submitProfile: (fields: ProfileEditorSubmit) => void;
  deleteProfile: (p: InstructionProfile) => void;
  /** The tier quota that refused the in-progress create, or `null`. When set the
   *  editor stays open with the typed values intact and shows the upgrade nudge
   *  (block-with-nudge). Only a create can be quota-refused; cleared on open/close. */
  createQuota: QuotaErrorDetail | null;

  // --- imperative open (e.g. after a create from another surface) -------------
  /** Open the editor for this profile id once the library has it. */
  openProfile: (id: string) => void;

  // --- starter-profile install ---
  /** Install a domain's bundled starter profiles via the worker, then reconcile.
   *  Resolves to the number inserted (0 when already installed). */
  installSeeds: (domain: DomainId) => Promise<number>;
}

/** Build the profiles view-model. Pass `view` in tests to drive it over a stub
 *  library; production omits it and uses the live worker-backed hook. */
export function useProfilesController(view?: ProfileLibraryView): ProfilesController {
  const live = useProfileLibrary();
  const lib = view ?? live;
  const { profiles, status } = lib;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<InstructionProfile | undefined>(undefined);
  const [createQuota, setCreateQuota] = useState<QuotaErrorDetail | null>(null);

  // The pending open target: held until the library has that id, then the editor opens
  // and the pending id clears (the library may still be loading). Mirrors the prompts
  // controller's `pendingOpenId`.
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingOpenId) return;
    const target = profiles.find((p) => p.id === pendingOpenId);
    if (target) {
      setEditing(target);
      setEditorOpen(true);
      setPendingOpenId(null);
    }
  }, [pendingOpenId, profiles]);

  const openCreate = useCallback((): void => {
    setEditing(undefined);
    setCreateQuota(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((p: InstructionProfile): void => {
    setEditing(p);
    setCreateQuota(null);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback((): void => {
    setEditorOpen(false);
    setEditing(undefined);
    setCreateQuota(null);
  }, []);

  const submitProfile = useCallback(
    (fields: ProfileEditorSubmit): void => {
      // Update is never quota-governed; close on send (observe-don't-replay). Create
      // awaits the result: on a `quota_exceeded` rejection keep the editor open with
      // the typed values and surface the nudge ([PRIV] never lose input).
      if (editing) {
        void lib.mutate({ op: 'profile.update', id: editing.id, ...fields });
        setEditorOpen(false);
        setEditing(undefined);
        return;
      }
      setCreateQuota(null);
      void lib.mutate({ op: 'profile.create', id: makeProfileId(), ...fields }).then((res) => {
        const quota = quotaDetailOf(res.error);
        if (quota) {
          setCreateQuota(quota);
          return; // keep the editor open with the draft intact
        }
        setEditorOpen(false);
        setEditing(undefined);
      });
    },
    [editing, lib],
  );

  const deleteProfile = useCallback(
    (p: InstructionProfile): void => {
      void lib.mutate({ op: 'profile.delete', id: p.id });
      setEditorOpen(false);
      setEditing(undefined);
    },
    [lib],
  );

  const openProfile = useCallback((id: string): void => {
    setPendingOpenId(id);
  }, []);

  const installSeeds = useCallback(
    async (domain: DomainId): Promise<number> => {
      const res = await installProfileSeedsRemote(domain);
      lib.refresh();
      return res.ok ? res.data.installed : 0;
    },
    [lib],
  );

  return {
    profiles,
    status,
    retry: lib.retry,
    editorOpen,
    editing,
    openCreate,
    openEdit,
    closeEditor,
    submitProfile,
    deleteProfile,
    createQuota,
    openProfile,
    installSeeds,
  };
}
