import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, Edit3, RotateCcw, Save, X } from "lucide-react";

type TextEditContextType = {
  isEditMode: boolean;
  setIsEditMode: (val: boolean) => void;
  getText: (key: string, defaultText: string) => string;
  setText: (key: string, newText: string) => void;
  hasUnsavedChanges: boolean;
  saveAllChanges: () => Promise<void>;
  discardChanges: () => void;
};

const TextEditContext = createContext<TextEditContextType | null>(null);

const STORAGE_KEY = "skyworlds_custom_ui_texts";

export function TextEditProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

  const trpcUtils = trpc.useUtils();
  const setMutation = trpc.siteContent.set.useMutation();

  // If user logs out, disable edit mode
  useEffect(() => {
    if (!user) {
      setIsEditMode(false);
    }
  }, [user]);

  const getText = (key: string, defaultText: string): string => {
    if (pendingChanges[key] !== undefined) return pendingChanges[key];
    if (editedTexts[key] !== undefined) return editedTexts[key];
    return defaultText;
  };

  const setText = (key: string, newText: string) => {
    setPendingChanges(prev => ({ ...prev, [key]: newText }));
  };

  const hasUnsavedChanges = Object.keys(pendingChanges).length > 0;

  const saveAllChanges = async () => {
    if (!hasUnsavedChanges) {
      setIsEditMode(false);
      return;
    }
    try {
      const updated = { ...editedTexts, ...pendingChanges };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setEditedTexts(updated);

      // Save to database
      for (const [key, value] of Object.entries(pendingChanges)) {
        await setMutation.mutateAsync({ key, value });
      }

      setPendingChanges({});
      setIsEditMode(false);
      toast.success("All front-end text changes saved successfully.");
    } catch (err) {
      toast.error("Failed to save changes to the database, but saved locally.");
    }
  };

  const discardChanges = () => {
    setPendingChanges({});
    setIsEditMode(false);
    toast.info("Unsaved text changes discarded.");
  };

  return (
    <TextEditContext.Provider
      value={{
        isEditMode,
        setIsEditMode,
        getText,
        setText,
        hasUnsavedChanges,
        saveAllChanges,
        discardChanges,
      }}
    >
      {children}
      {/* Floating Operator Edit Bar when logged in */}
      {user && (
        <div className="fixed bottom-5 right-6 z-50 flex items-center gap-2 rounded-2xl bg-white/95 px-3.5 py-2 shadow-2xl border border-indigo-200/90 backdrop-blur-md">
          {!isEditMode ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditMode(true)}
              className="h-8 gap-1.5 text-xs font-bold text-[#3D52A0] border-indigo-300 bg-indigo-50/60 hover:bg-indigo-100/80 shadow-sm"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Edit Page Texts
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 animate-pulse">
                Text Edit Mode Active
              </span>
              <Button
                size="sm"
                onClick={saveAllChanges}
                className="h-8 gap-1.5 text-xs font-bold bg-[#3D52A0] text-white hover:bg-[#293252] shadow-sm"
              >
                <Save className="h-3.5 w-3.5" />
                Save All Changes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={discardChanges}
                className="h-8 px-2 text-xs text-slate-500 hover:text-slate-800"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </TextEditContext.Provider>
  );
}

export function useTextEdit() {
  const ctx = useContext(TextEditContext);
  if (!ctx) throw new Error("useTextEdit must be used within TextEditProvider");
  return ctx;
}

export function EditableText({
  contentKey,
  defaultText,
  className = "",
  as: Component = "span",
}: {
  contentKey: string;
  defaultText: string;
  className?: string;
  as?: any;
}) {
  const { isEditMode, getText, setText } = useTextEdit();
  const text = getText(contentKey, defaultText);

  if (!isEditMode) {
    return <Component className={className}>{text}</Component>;
  }

  return (
    <Component
      contentEditable
      suppressContentEditableWarning
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const val = e.currentTarget.textContent || "";
        setText(contentKey, val);
      }}
      className={`${className} outline-dashed outline-2 outline-indigo-400 bg-indigo-50/70 px-1 py-0.5 rounded cursor-text hover:bg-indigo-100/70 transition-colors`}
      title="Click to edit text (Operator mode)"
    >
      {text}
    </Component>
  );
}
