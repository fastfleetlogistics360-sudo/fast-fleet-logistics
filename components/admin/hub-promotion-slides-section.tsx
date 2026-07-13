"use client";

import type { ChangeEvent } from "react";
import { ArrowDown, ArrowUp, BellRing, FilePenLine, ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { defaultHubPromotionSlides, type HubPromotionSlide } from "@/lib/hub-promotion-slides";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type HubPromotionSlidesSectionProps = {
  slides: HubPromotionSlide[];
  busyAction: string | null;
  uploadProgress: Record<string, number>;
  onSlideChange: (id: string, patch: Partial<HubPromotionSlide>) => void;
  onImageUpload: (id: string, file: File) => void | Promise<void>;
  onAddSlide: () => void;
  onRemoveSlide: (id: string) => void;
  onMoveSlide: (id: string, direction: -1 | 1) => void;
  onSave: (options?: { notifyUsers?: boolean }) => void;
};

export function HubPromotionSlidesSection({
  slides,
  busyAction,
  uploadProgress,
  onSlideChange,
  onImageUpload,
  onAddSlide,
  onRemoveSlide,
  onMoveSlide,
  onSave
}: HubPromotionSlidesSectionProps) {
  const saving = busyAction === "hub-promotions:save";
  const notifying = busyAction === "hub-promotions:notify";
  const busy = saving || notifying;
  const editableSlides = slides.length ? slides : defaultHubPromotionSlides;

  function handleImageUpload(slideId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void onImageUpload(slideId, file);
  }

  return (
    <Card id="hub-promotions" className="mt-6 scroll-mt-24 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-fleet-line p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-fleet-night text-white"><FilePenLine className="h-5 w-5" /></span>
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Hub authority</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night">/hub promotions carousel</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Manage the promotional carousel shown only on the App Hub. This is separate from the public /main hero slider.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onAddSlide}><Plus className="h-4 w-4" />Add promotion</Button>
          <Button type="button" variant="secondary" onClick={() => onSave()} disabled={busy}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save only</Button>
          <Button type="button" onClick={() => onSave({ notifyUsers: true })} disabled={busy}>{notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}Save & notify users</Button>
        </div>
      </div>

      <div className="grid gap-5 p-4">
        {editableSlides.map((slide, index) => {
          const progress = uploadProgress[slide.id];
          const uploading = typeof progress === "number";
          return (
            <article key={slide.id} className="rounded-fleet border border-fleet-line bg-white p-4">
              <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <div className="overflow-hidden rounded-fleet border border-fleet-line bg-fleet-night">
                  <div className="grid h-44 place-items-center p-3">
                    {slide.image ? <img src={slide.image} alt="" className="h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="text-xs font-bold text-white/65">No image selected</span>}
                  </div>
                  <div className="grid gap-3 bg-fleet-paper p-3">
                    <div className="flex items-center justify-between gap-2"><StatusBadge tone={slide.enabled ? "green" : "neutral"}>{slide.enabled ? "Live" : "Disabled"}</StatusBadge><span className="text-xs font-black text-slate-500">Promotion {index + 1}</span></div>
                    <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-fleet px-4 py-2 text-sm font-black transition ${uploading ? "bg-slate-200 text-slate-500" : "bg-fleet-night text-white shadow-fleet hover:-translate-y-0.5"}`} aria-disabled={uploading}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      {uploading ? `Uploading ${progress}%` : "Upload image"}
                      <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(event) => handleImageUpload(slide.id, event)} />
                    </label>
                  </div>
                </div>

                <div className="grid gap-3">
                  <label className="form-field"><span className="form-label">Orange label</span><input className="form-input" value={slide.badgeText} onChange={(event) => onSlideChange(slide.id, { badgeText: event.target.value })} placeholder="New on Fast Fleets" /></label>
                  <label className="form-field"><span className="form-label">Headline</span><input className="form-input" value={slide.title} onChange={(event) => onSlideChange(slide.id, { title: event.target.value })} placeholder="More delivery options" /></label>
                  <label className="form-field"><span className="form-label">Supporting text</span><textarea className="form-input min-h-20" value={slide.description} onChange={(event) => onSlideChange(slide.id, { description: event.target.value })} placeholder="Add a short customer-facing description." /></label>
                  <label className="form-field"><span className="form-label">Promotion image URL</span><input className="form-input" value={slide.image} onChange={(event) => onSlideChange(slide.id, { image: event.target.value })} placeholder="https://..." /><span className="text-xs font-bold leading-5 text-slate-500">Images are fully contained in the Hub banner, so they scale to fit rather than crop or break the layout.</span></label>
                  <label className="form-field"><span className="form-label">Tap destination</span><input className="form-input" value={slide.href} onChange={(event) => onSlideChange(slide.id, { href: event.target.value })} placeholder="/services" /></label>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-fleet bg-fleet-paper p-3">
                    <label className="flex items-center gap-2 text-sm font-black text-fleet-night"><input type="checkbox" className="h-5 w-5 accent-fleet-ember" checked={slide.enabled} onChange={(event) => onSlideChange(slide.id, { enabled: event.target.checked })} />Enable promotion</label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => onMoveSlide(slide.id, -1)} disabled={index === 0} aria-label={`Move ${slide.title || "promotion"} up`}><ArrowUp className="h-4 w-4" /></Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => onMoveSlide(slide.id, 1)} disabled={index === editableSlides.length - 1} aria-label={`Move ${slide.title || "promotion"} down`}><ArrowDown className="h-4 w-4" /></Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => onRemoveSlide(slide.id)} disabled={editableSlides.length <= 1}><Trash2 className="h-4 w-4" />Remove</Button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
