import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Check, Edit2, Info, X } from "lucide-react";
import { toast } from "sonner";

export function EditableNotice({
  contentKey,
  defaultText,
  className = "",
}: {
  contentKey: string;
  defaultText: string;
  className?: string;
}) {
  const { user } = useAuth();
  const trpcUtils = trpc.useUtils();
  const { data } = trpc.siteContent.get.useQuery({ key: contentKey });

  const [isEditing, setIsEditing] = useState(false);
  const [currentText, setCurrentText] = useState(defaultText);

  const setMutation = trpc.siteContent.set.useMutation({
    onSuccess: async () => {
      await trpcUtils.siteContent.get.invalidate({ key: contentKey });
      setIsEditing(false);
      toast.success("Front-end notice updated and saved.");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update text.");
    },
  });

  const displayedText = data?.value ?? defaultText;

  const handleSave = () => {
    if (!currentText.trim()) return;
    setMutation.mutate({ key: contentKey, value: currentText.trim() });
  };

  return (
    <div className={`rounded-xl border border-indigo-200/80 bg-indigo-50/70 p-3 text-xs text-indigo-950 flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Info className="h-4 w-4 text-[#3D52A0] shrink-0" />
        {isEditing ? (
          <Input
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            className="h-7 text-xs bg-white text-slate-900 border-indigo-300 flex-1"
            autoFocus
          />
        ) : (
          <span className="truncate font-medium">{displayedText}</span>
        )}
      </div>

      {user && (
        <div className="flex items-center gap-1.5 shrink-0">
          {isEditing ? (
            <>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={setMutation.isPending}
                className="h-6 px-2 text-[10px] bg-[#3D52A0] hover:bg-[#293252] text-white font-bold"
              >
                <Check className="h-3 w-3 mr-1" />
                {setMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setCurrentText(displayedText);
                }}
                className="h-6 px-1.5 text-[10px] text-slate-500"
              >
                <X className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCurrentText(displayedText);
                setIsEditing(true);
              }}
              className="h-6 px-2 text-[10px] text-[#3D52A0] hover:text-[#293252] font-semibold flex items-center gap-1"
              title="Edit notice text (Operator permission)"
            >
              <Edit2 className="h-3 w-3" />
              Edit Text
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
