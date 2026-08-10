<template>
  <div>
    <!-- ===== TOP TOOLBAR: Draft/Publish/Preview ===== -->
    <div class="table-toolbar" style="flex-wrap:wrap;gap:8px;align-items:center">
      <h3 style="margin-right:auto">Landing Page Content</h3>

      <!-- Status badge -->
      <span v-if="status.hasDraft" style="font-size:11px;padding:3px 10px;border-radius:99px;background:#fff3cd;color:#856404;border:1px solid #ffc107;font-weight:600">
        {{ status.scheduledAt ? 'Scheduled' : 'Unpublished changes' }}
      </span>
      <span v-else style="font-size:11px;padding:3px 10px;border-radius:99px;background:#d4edda;color:#155724;border:1px solid #28a745;font-weight:600">
        Published
      </span>

      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" @click="showVersions = !showVersions" :style="showVersions ? 'background:var(--bg-subtle,#f0f0f0)' : ''">
          {{ showVersions ? 'Hide' : 'Versions' }}
        </button>
        <button class="btn btn-sm btn-outline" @click="openPreview" title="Preview draft on live site">
          Preview
        </button>
        <button class="btn btn-sm btn-outline" @click="showSchedule = true" :disabled="!status.hasDraft" title="Schedule for later">
          Schedule
        </button>
        <base-button text="Discard" variant="btn-sm btn-outline" extra-class="btn-danger-text" :disabled="!status.hasDraft" :on-click="discardDraft" loading-label="Discarding..." success-label="Discarded ✓" error-label="Discard Failed"></base-button>
        <base-button text="Save Draft" variant="btn-sm btn-primary" :on-click="saveDraft" loading-label="Saving..." success-label="Draft Saved ✓" error-label="Save Failed"></base-button>
        <base-button text="Publish" variant="btn-sm" extra-class="btn-publish" :on-click="publishNow" loading-label="Publishing..." success-label="Published ✓" error-label="Publish Failed"></base-button>
      </div>
    </div>

    <!-- ===== VERSION HISTORY PANEL ===== -->
    <div v-if="showVersions" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Version History</h3></div>
      <div v-if="versions.length === 0" style="padding:16px;color:var(--text-muted);font-size:13px">No versions saved yet.</div>
      <div v-for="v in versions" :key="v.id" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px">
        <div style="flex:1">
          <div style="font-weight:600">{{ v.note || 'Untitled' }}</div>
          <div style="color:var(--text-muted);font-size:11px;margin-top:2px">{{ formatTime(v.timestamp) }}</div>
        </div>
        <div style="display:flex;gap:4px">
          <base-button text="Load" variant="btn-sm btn-outline" :on-click="() => loadVersion(v.id)" loading-label="Loading..." success-label="Loaded ✓" error-label="Load Failed" title="Load this version into editor"></base-button>
          <base-button text="Rollback" variant="btn-sm btn-outline" :on-click="() => rollbackTo(v.id)" loading-label="Rolling back..." success-label="Rolled Back ✓" error-label="Rollback Failed" title="Restore this version to live"></base-button>
        </div>
      </div>
    </div>

    <!-- ===== SCHEDULE MODAL ===== -->
    <div v-if="showSchedule" style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9998;display:flex;align-items:center;justify-content:center" @click.self="showSchedule = false">
      <div style="background:var(--color-surface,#fff);border-radius:12px;padding:24px;width:380px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <h3 style="margin-bottom:16px">Schedule Publishing</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Set a date and time for this draft to go live automatically.</p>
        <div class="form-group">
          <label>Publish Date & Time (UTC)</label>
          <input type="datetime-local" v-model="scheduleDate" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-sm btn-outline" @click="showSchedule = false">Cancel</button>
          <base-button text="Schedule" variant="btn-sm btn-primary" :on-click="schedulePublish" loading-label="Scheduling..." success-label="Scheduled ✓" error-label="Schedule Failed"></base-button>
        </div>
      </div>
    </div>

    <!-- ===== SECTION MANAGER (Dynamic Zones) ===== -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Page Sections</h3></div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Toggle visibility and drag to reorder sections on the landing page. Hidden sections won't appear to visitors.</p>
      <div style="display:flex;flex-direction:column;gap:4px">
        <div v-for="(sec, i) in sectionLayout" :key="sec.id"
             style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-subtle,#f7f7f7);border-radius:8px;font-size:13px">
          <span style="color:var(--text-muted);cursor:grab;font-weight:700;min-width:20px">{{ i + 1 }}</span>
          <span style="flex:1;font-weight:500">{{ sec.label }}</span>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;color:var(--text-muted)">
            <input type="checkbox" v-model="sec.visible" style="accent-color:var(--color-primary,#0F7B78)" />
            {{ sec.visible ? 'Visible' : 'Hidden' }}
          </label>
          <button class="btn btn-sm btn-outline" @click="moveSection(i, -1)" :disabled="i === 0" style="padding:2px 8px">↑</button>
          <button class="btn btn-sm btn-outline" @click="moveSection(i, 1)" :disabled="i === sectionLayout.length - 1" style="padding:2px 8px">↓</button>
        </div>
      </div>
    </div>

    <!-- ===== SECTION EDIT FORMS (all preserved, wrapped in v-show for dynamic zones) ===== -->

    <!-- Hero -->
    <section v-show="getSection('hero').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Hero Section</h3></div>
      <div class="form-group"><label>Amharic Text</label><input v-model="data.hero.amharic" /></div>
      <div class="form-group"><label>Headline</label><textarea v-model="data.hero.title" rows="2"></textarea></div>
      <div class="form-group"><label>Subtitle</label><textarea v-model="data.hero.subtitle" rows="2"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Primary Button</label><input v-model="data.hero.btn1" /></div>
        <div class="form-group"><label>Secondary Button</label><input v-model="data.hero.btn2" /></div>
      </div>
    </section>

    <!-- Brand Story -->
    <section v-show="getSection('story').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Brand Story</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.story.eyebrow" /></div>
        <div class="form-group"><label>Title</label><input v-model="data.story.title" /></div>
      </div>
      <div class="form-group"><label>Paragraph 1</label><textarea v-model="data.story.p1" rows="3"></textarea></div>
      <div class="form-group"><label>Paragraph 2</label><textarea v-model="data.story.p2" rows="3"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Badge 1 Number</label><input v-model="data.story.badge1Num" /></div>
        <div class="form-group"><label>Badge 1 Label</label><input v-model="data.story.badge1Label" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Badge 2 Number</label><input v-model="data.story.badge2Num" /></div>
        <div class="form-group"><label>Badge 2 Label</label><input v-model="data.story.badge2Label" /></div>
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Feature Bullets</label>
        <div class="form-row">
          <div class="form-group"><label>Feature 1</label><input v-model="data.story.feat1" /></div>
          <div class="form-group"><label>Feature 2</label><input v-model="data.story.feat2" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Feature 3</label><input v-model="data.story.feat3" /></div>
          <div class="form-group"><label>Feature 4</label><input v-model="data.story.feat4" /></div>
        </div>
      </div>
    </section>

    <!-- Signature Coffee -->
    <section v-show="getSection('coffee').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Signature Coffee</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.signatureCoffee.eyebrow" /></div>
        <div class="form-group"><label>Section Title</label><input v-model="data.signatureCoffee.title" /></div>
      </div>
      <div class="form-group"><label>Intro Paragraph</label><textarea v-model="data.signatureCoffee.intro" rows="3" /></div>
      <div class="form-group">
        <label>Showcase Photo (the large product image)</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input v-model="data.signatureCoffee.image" placeholder="Upload a file, or paste a URL" style="flex:1" />
          <label class="btn btn-sm btn-outline" style="white-space:nowrap;cursor:pointer">
            <input type="file" accept="image/*" style="display:none"
                   :disabled="uploading === 'showcase'"
                   @change="uploadShowcase" />
            {{ uploading === 'showcase' ? 'Uploading…' : '📁 Upload' }}
          </label>
          <button v-if="data.signatureCoffee.image" class="btn btn-sm btn-ghost" type="button"
                  @click="data.signatureCoffee.image = ''">Clear</button>
        </div>
        <!-- A preview, because a URL field gives no way to tell a working image
             from a broken one until the site is published. -->
        <div v-if="data.signatureCoffee.image" style="margin-top:8px;height:120px;border-radius:8px;overflow:hidden;background:var(--bg-subtle,#f7f7f7)">
          <img :src="data.signatureCoffee.image" style="width:100%;height:100%;object-fit:contain"
               @error="e => e.target.style.display = 'none'"
               @load="e => e.target.style.display = ''" />
        </div>
      </div>

      <!-- These are the packages the section actually renders. The previous
           editor here wrote to signatureCoffee.cards, and the website rendered
           those into a .coffee-grid that no longer exists in the page - so every
           edit saved successfully and changed nothing on the site. -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px">
        <h4 style="margin:0">Packages</h4>
        <button class="btn btn-sm btn-primary" type="button" @click="addPackage">+ Add Package</button>
      </div>

      <div v-for="(pkg, i) in data.signatureCoffee.packages" :key="i" style="margin-top:12px;padding:14px;background:var(--bg-subtle,#f7f7f7);border-radius:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Package {{ i + 1 }}</div>
          <button class="btn btn-sm btn-ghost" type="button" @click="removePackage(i)">Remove</button>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Name</label><input v-model="pkg.name" /></div>
          <div class="form-group"><label>Price (ETB)</label><input v-model.number="pkg.price" type="number" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Unit</label><input v-model="pkg.unit" placeholder="/kg" /></div>
          <div class="form-group">
            <label>Icon</label>
            <!-- A key, not markup: the artwork stays in the website so a CMS
                 field can never inject HTML into the page. -->
            <select v-model="pkg.icon" class="select">
              <option value="bean">Bean (raw)</option>
              <option value="roast">Roast</option>
              <option value="ground">Ground</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Ribbon (leave empty for none)</label><input v-model="pkg.ribbon" placeholder="Most Popular" /></div>
          <div class="form-group">
            <label>Highlight this package</label>
            <select v-model="pkg.featured" class="select">
              <option :value="false">No</option>
              <option :value="true">Yes</option>
            </select>
          </div>
        </div>
        <div class="form-group"><label>Description</label><textarea v-model="pkg.desc" rows="2" /></div>
        <div class="form-group">
          <label>Package Photo (shown in the order popup)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input v-model="pkg.image" placeholder="Upload a file, or paste a URL" style="flex:1" />
            <label class="btn btn-sm btn-outline" style="white-space:nowrap;cursor:pointer">
              <input type="file" accept="image/*" style="display:none"
                     :disabled="uploading === 'pkg-' + i"
                     @change="e => uploadPackageImage(e, i)" />
              {{ uploading === 'pkg-' + i ? 'Uploading…' : (pkg.image ? '📁 Replace' : '📁 Upload') }}
            </label>
            <button v-if="pkg.image" class="btn btn-sm btn-ghost" type="button" @click="pkg.image = ''">Clear</button>
          </div>
          <div v-if="pkg.image" style="margin-top:8px;height:100px;border-radius:8px;overflow:hidden;background:var(--bg-subtle,#f7f7f7)">
            <img :src="pkg.image" style="width:100%;height:100%;object-fit:contain"
                 @error="e => e.target.style.display = 'none'"
                 @load="e => e.target.style.display = ''" />
          </div>
        </div>
      </div>

      <p v-if="!data.signatureCoffee.packages || !data.signatureCoffee.packages.length"
         style="margin-top:12px;font-size:13px;color:var(--text-muted)">
        No packages yet. The website keeps showing its built-in three until at least one is added here.
      </p>
    </section>

    <!-- Menu Section Heading -->
    <section v-show="getSection('menu').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Menu Section</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Script Text</label><input v-model="data.menu.script" /></div>
        <div class="form-group"><label>Eyebrow</label><input v-model="data.menu.eyebrow" /></div>
      </div>
      <div class="form-group"><label>Title</label><input v-model="data.menu.title" /></div>
    </section>

    <!-- Stats -->
    <section v-show="getSection('stats').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Stats Counters</h3></div>
      <div v-for="(stat, i) in data.stats" :key="i" class="form-row" style="margin-bottom:8px">
        <div class="form-group"><label>Stat {{ i+1 }} Value</label><input v-model.number="stat.value" type="number" /></div>
        <div class="form-group"><label>Stat {{ i+1 }} Label</label><input v-model="stat.label" /></div>
      </div>
    </section>

    <!-- Ceremony -->
    <section v-show="getSection('ceremony').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Coffee Ceremony</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.ceremony.eyebrow" /></div>
        <div class="form-group"><label>Title</label><input v-model="data.ceremony.title" /></div>
      </div>
      <div class="form-group"><label>Description</label><textarea v-model="data.ceremony.desc" rows="2"></textarea></div>
      <div v-for="(step, i) in data.ceremony.steps" :key="i" class="form-row" style="margin-bottom:6px">
        <div class="form-group"><label>Step {{ i+1 }} Title</label><input v-model="step.title" /></div>
        <div class="form-group"><label>Step {{ i+1 }} Text</label><input v-model="step.text" /></div>
      </div>
      <div class="form-group"><label>CTA Button</label><input v-model="data.ceremony.cta" /></div>
      <div class="form-group" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label>Ceremony Photo URL</label>
        <input v-model="data.ceremony.image" placeholder="https://example.com/photo.jpg" />
        <div v-if="data.ceremony.image" style="margin-top:8px">
          <img :src="resolveUrl(data.ceremony.image)" alt="preview" style="max-width:220px;border-radius:8px;border:1px solid var(--border)" @error="$event.target.style.display='none'" />
        </div>
      </div>
    </section>

    <!-- Gallery Section Heading -->
    <section v-show="getSection('gallery').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Gallery Section</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.gallerySection.eyebrow" /></div>
        <div class="form-group"><label>Title</label><input v-model="data.gallerySection.title" /></div>
      </div>
      <div class="form-group"><label>Description</label><input v-model="data.gallerySection.desc" /></div>
    </section>

    <!-- Gallery Photos -->
    <section v-show="getSection('gallery').visible" class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3>Gallery Photos</h3>
        <button class="btn btn-sm btn-outline" @click="addGalleryItem">+ Add Photo</button>
      </div>
      <div v-if="data.gallery.length === 0" style="padding:16px;color:var(--text-muted);font-size:13px">No photos yet. Click "+ Add Photo".</div>
      <div v-for="(item, i) in data.gallery" :key="i" style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
        <img v-if="item.url" :src="resolveUrl(item.url)" style="width:64px;height:64px;object-fit:cover;border-radius:6px;flex-shrink:0" @error="$event.target.style.display='none'" />
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <input v-model="item.url"   placeholder="Image URL" style="width:100%" />
          <input v-model="item.title" placeholder="Caption (optional)" />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <button class="btn btn-sm btn-outline" @click="moveGalleryItem(i,-1)" :disabled="i===0">↑</button>
          <button class="btn btn-sm btn-outline" @click="moveGalleryItem(i,1)" :disabled="i===data.gallery.length-1">↓</button>
          <button class="btn btn-sm" style="color:var(--danger,#c0392b)" @click="removeGalleryItem(i)">✕</button>
        </div>
      </div>
    </section>

    <!-- Testimonials -->
    <section v-show="getSection('testimonials').visible" class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3>Testimonials Section</h3>
        <button class="btn btn-sm btn-outline" @click="addTestimonial">+ Add Testimonial</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.testimonials.eyebrow" /></div>
        <div class="form-group"><label>Title</label><input v-model="data.testimonials.title" /></div>
      </div>
      <div v-if="data.testimonialCards.length === 0" style="padding:16px;color:var(--text-muted);font-size:13px">No testimonials yet. Click "+ Add Testimonial".</div>
      <div v-for="(card, i) in data.testimonialCards" :key="i" style="margin-top:16px;padding:14px;background:var(--bg-subtle,#f7f7f7);border-radius:8px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
          <span>Testimonial {{ i + 1 }}</span>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm btn-outline" @click="moveTestimonial(i,-1)" :disabled="i===0">↑</button>
            <button class="btn btn-sm btn-outline" @click="moveTestimonial(i,1)" :disabled="i===data.testimonialCards.length-1">↓</button>
            <button class="btn btn-sm" style="color:var(--danger,#c0392b)" @click="removeTestimonial(i)">✕</button>
          </div>
        </div>
        <div class="form-group"><label>Quote</label><textarea v-model="card.quote" rows="2" placeholder="'The ceremony felt like home...'" /></div>
        <div class="form-row">
          <div class="form-group"><label>Name</label><input v-model="card.name" placeholder="Selam T." /></div>
          <div class="form-group"><label>Role / Location</label><input v-model="card.role" placeholder="Regular · Addis Ababa" /></div>
        </div>
        <div class="form-group">
          <label>Avatar Image URL</label>
          <input v-model="card.avatar" placeholder="assets/avatar-1494790108377.jpg" />
          <div v-if="card.avatar" style="margin-top:6px">
            <img :src="resolveUrl(card.avatar)" alt="preview" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--border)" @error="$event.target.style.display='none'" />
          </div>
        </div>
      </div>
    </section>

    <!-- Reservation Info -->
    <section v-show="getSection('reservation').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Reservation Section</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Eyebrow</label><input v-model="data.reservation.eyebrow" /></div>
        <div class="form-group"><label>Title</label><input v-model="data.reservation.title" /></div>
      </div>
      <div class="form-group"><label>Description</label><textarea v-model="data.reservation.desc" rows="2" /></div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Info Cards</label>
        <div class="form-group"><label>Opening Hours</label><input v-model="data.reservation.hoursVal" /></div>
        <div class="form-group"><label>Location</label><input v-model="data.reservation.locationVal" /></div>
        <div class="form-group"><label>Phone / Contact</label><input v-model="data.reservation.contactVal" /></div>
      </div>
    </section>

    <!-- Footer -->
    <section v-show="getSection('footer').visible" class="card" style="margin-bottom:14px">
      <div class="card-header"><h3>Footer</h3></div>
      <div class="form-row">
        <div class="form-group"><label>Brand Name (Amharic)</label><input v-model="data.footer.amharicBrand" placeholder="ፉፉቱ ኮፊ" /></div>
        <div class="form-group"><label>Tagline (Amharic)</label><input v-model="data.footer.craft" /></div>
      </div>
      <div class="form-group"><label>Brand Description</label><textarea v-model="data.footer.desc" rows="2"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Copyright Year</label><input v-model="data.footer.year" /></div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Opening Hours Column</label>
        <div class="form-row">
          <div class="form-group"><label>Mon – Fri</label><input v-model="data.footer.monFri" /></div>
          <div class="form-group"><label>Saturday</label><input v-model="data.footer.sat" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Sunday</label><input v-model="data.footer.sun" /></div>
          <div class="form-group"><label>Holidays</label><input v-model="data.footer.holidays" /></div>
        </div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Contact Column</label>
        <div class="form-row">
          <div class="form-group"><label>Phone</label><input v-model="data.footer.phone" /></div>
          <div class="form-group"><label>Email</label><input v-model="data.footer.email" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Address Line 1</label><input v-model="data.footer.address1" /></div>
          <div class="form-group"><label>Address Line 2</label><input v-model="data.footer.address2" /></div>
        </div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
        <label style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Social Links</label>
        <div class="form-row">
          <div class="form-group"><label>Instagram URL</label><input v-model="data.footer.instagram" /></div>
          <div class="form-group"><label>Facebook URL</label><input v-model="data.footer.facebook" /></div>
        </div>
        <div class="form-group"><label>Twitter / X URL</label><input v-model="data.footer.twitter" /></div>
      </div>
    </section>

  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { apiGet, apiPost, apiUpload } from '../api/index.js'

const SITE_ORIGIN = 'https://www.fufutcoffee.com'

/** Resolve relative asset paths to absolute landing-page URLs */
function resolveUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url
  return SITE_ORIGIN + '/' + url.replace(/^\//, '')
}

function toast(msg, type = 'success') {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText = `position:fixed;bottom:24px;right:24px;background:${type==='error'?'#c0392b':'#0F7B78'};color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.18)`
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ===== SECTION LAYOUT (Dynamic Zones) =====
const DEFAULT_LAYOUT = [
  { id: 'hero',        label: 'Hero Section',        visible: true },
  { id: 'story',       label: 'Brand Story',        visible: true },
  { id: 'coffee',      label: 'Signature Coffee',   visible: true },
  { id: 'menu',        label: 'Menu Section',       visible: true },
  { id: 'stats',       label: 'Stats Counters',     visible: true },
  { id: 'ceremony',    label: 'Coffee Ceremony',    visible: true },
  { id: 'gallery',     label: 'Gallery',            visible: true },
  { id: 'testimonials',label: 'Testimonials',       visible: true },
  { id: 'reservation', label: 'Reservation Info',   visible: true },
  { id: 'footer',      label: 'Footer',             visible: true },
]

const sectionLayout = reactive(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)))

function getSection(id) {
  return sectionLayout.find(s => s.id === id) || { id, visible: true }
}

function moveSection(i, d) {
  const j = i + d
  if (j < 0 || j >= sectionLayout.length) return
  ;[sectionLayout[i], sectionLayout[j]] = [sectionLayout[j], sectionLayout[i]]
}

// ===== CONTENT DATA =====
const data = reactive({
  hero:     { amharic:'', title:'', subtitle:'', btn1:'', btn2:'' },
  story:    { eyebrow:'', title:'', p1:'', p2:'', badge1Num:'', badge1Label:'', badge2Num:'', badge2Label:'', feat1:'', feat2:'', feat3:'', feat4:'' },
  // `packages` is what the website renders. `cards` is kept only so an older
  // saved document round-trips without losing data; nothing reads it any more.
  signatureCoffee: {
    eyebrow: '', title: '', intro: '', image: '',
    packages: [],
    cards: []
  },
  menu:     { script:'', eyebrow:'', title:'' },
  stats:    [{value:0,label:''},{value:0,label:''},{value:0,label:''},{value:0,label:''}],
  ceremony: { eyebrow:'', title:'', desc:'', steps:[{title:'',text:''},{title:'',text:''},{title:'',text:''}], cta:'', image:'' },
  gallerySection: { eyebrow:'', title:'', desc:'' },
  gallery:  [],
  testimonials: { eyebrow:'', title:'' },
  testimonialCards: [],
  reservation: { eyebrow:'', title:'', desc:'', hoursVal:'', locationVal:'', contactVal:'' },
  footer:   { amharicBrand:'', desc:'', year:'2026', craft:'', monFri:'', sat:'', sun:'', holidays:'', phone:'', email:'', address1:'', address2:'', instagram:'', facebook:'', twitter:'' }
})

// ===== VERSIONS & STATUS =====
const versions = ref([])
const showVersions = ref(false)
const showSchedule = ref(false)
const scheduleDate = ref('')
const status = reactive({ hasDraft: false, scheduledAt: null })

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function buildPayload() {
  // Build the content object with section layout included (under _ prefix so server strips it)
  const payload = { ...data }
  payload._sectionLayout = sectionLayout.map(s => ({ id: s.id, visible: s.visible }))
  return payload
}

// ===== LOAD CONTENT =====
async function loadContent() {
  try {
    // Try loading draft first (if admin was editing)
    const json = await apiGet('content?draft=true')
    applyContent(json)
    status.hasDraft = true
  } catch {
    // Fall back to published
    try {
      const json = await apiGet('content')
      applyContent(json)
    } catch {}
  }
  // Load status
  try {
    const s = await apiGet('content/status')
    status.hasDraft = s.hasDraft
    status.scheduledAt = s.scheduledAt
  } catch {}
  // Load version history
  await loadVersions()
}

function applyContent(json) {
  if (json.hero)     Object.assign(data.hero, json.hero)
  if (json.story)    Object.assign(data.story, json.story)
  if (json.signatureCoffee) {
    if (json.signatureCoffee.eyebrow !== undefined) data.signatureCoffee.eyebrow = json.signatureCoffee.eyebrow
    if (json.signatureCoffee.title   !== undefined) data.signatureCoffee.title   = json.signatureCoffee.title
    if (json.signatureCoffee.intro   !== undefined) data.signatureCoffee.intro   = json.signatureCoffee.intro
    if (json.signatureCoffee.image   !== undefined) data.signatureCoffee.image   = json.signatureCoffee.image
    // Replaced wholesale rather than merged by index, so removing a package
    // actually removes it. The old per-index Object.assign could only ever
    // overwrite the three slots it started with.
    if (Array.isArray(json.signatureCoffee.packages)) {
      data.signatureCoffee.packages.splice(0, data.signatureCoffee.packages.length, ...json.signatureCoffee.packages)
    }
    // Carried through untouched so an older document is not silently stripped
    // on the next save.
    if (Array.isArray(json.signatureCoffee.cards)) {
      data.signatureCoffee.cards.splice(0, data.signatureCoffee.cards.length, ...json.signatureCoffee.cards)
    }
  }
  if (json.menu)          Object.assign(data.menu, json.menu)
  if (json.stats && Array.isArray(json.stats)) {
    json.stats.forEach((s, i) => { if (data.stats[i]) Object.assign(data.stats[i], s) })
  }
  if (json.ceremony)      Object.assign(data.ceremony, json.ceremony)
  if (json.gallerySection) Object.assign(data.gallerySection, json.gallerySection)
  if (Array.isArray(json.gallery)) data.gallery.splice(0, data.gallery.length, ...json.gallery)
  if (json.testimonials)  Object.assign(data.testimonials, json.testimonials)
  if (Array.isArray(json.testimonialCards)) data.testimonialCards.splice(0, data.testimonialCards.length, ...json.testimonialCards)
  if (json.reservation)   Object.assign(data.reservation, json.reservation)
  if (json.footer)        Object.assign(data.footer, json.footer)
  // Section layout
  if (Array.isArray(json._sectionLayout)) {
    json._sectionLayout.forEach(sl => {
      const sec = sectionLayout.find(s => s.id === sl.id)
      if (sec) sec.visible = sl.visible !== false
    })
  }
}

// ===== ACTIONS =====

async function loadVersions() {
  try {
    versions.value = await apiGet('content/versions')
  } catch { versions.value = [] }
}

async function saveDraft() {
  const payload = buildPayload()
  await apiPost('content/draft', payload)
  status.hasDraft = true
  toast('Draft saved')
}

async function publishNow() {
  // Save draft first, then publish
  const payload = buildPayload()
  await apiPost('content/draft', payload)
  const res = await apiPost('content/publish', {})
  status.hasDraft = false
  status.scheduledAt = null
  showSchedule.value = false
  await loadVersions()
  toast('Published! Version: ' + (res.version || ''))
}

async function openPreview() {
  // Save draft first
  await saveDraft()
  // Open landing page with preview param
  // Detect origin: in dev use localhost, in prod use the live site
  const origin = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://futfutcoffee.com'
  window.open(origin + '?preview=true', '_blank')
}

async function schedulePublish() {
  if (!scheduleDate.value) { toastErr('Pick a date/time'); throw new Error('Pick a date/time') }
  // Save draft first
  const payload = buildPayload()
  await apiPost('content/draft', payload)
  // Then schedule
  const dt = new Date(scheduleDate.value).toISOString()
  await apiPost('content/schedule', { scheduled_at: dt })
  status.scheduledAt = dt
  showSchedule.value = false
  toast('Scheduled for ' + scheduleDate.value)
}

async function discardDraft() {
  if (!confirm('Discard unsaved draft? This cannot be undone.')) return
  await apiPost('content/discard', {})
  status.hasDraft = false
  status.scheduledAt = null
  // Reload published content
  const json = await apiGet('content')
  applyContent(json)
  toast('Draft discarded')
}

async function loadVersion(vid) {
  const res = await apiGet('content/versions/' + vid)
  if (res.content) applyContent(res.content)
  toast('Version ' + vid + ' loaded into editor')
}

async function rollbackTo(vid) {
  if (!confirm('Rollback to this version? This will immediately update the live site.')) return
  const res = await apiPost('content/rollback/' + vid, {})
  status.hasDraft = false
  await loadVersions()
  const json = await apiGet('content')
  applyContent(json)
  toast('Rolled back! New version: ' + (res.version || ''))
}

function exportContent() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'content.json'
  a.click()
}

function addGalleryItem()      { data.gallery.push({ url: '', title: '' }) }
function removeGalleryItem(i)  { data.gallery.splice(i, 1) }
function moveGalleryItem(i, d) {
  const j = i + d
  if (j < 0 || j >= data.gallery.length) return
  ;[data.gallery[i], data.gallery[j]] = [data.gallery[j], data.gallery[i]]
}

/**
 * A new package starts as a plain bean at no price rather than a copy of an
 * existing one, so a half-edited duplicate cannot reach the website looking
 * like a real product.
 */
function addPackage() {
  data.signatureCoffee.packages.push({
    name: '', price: 0, unit: '/kg', icon: 'bean',
    ribbon: '', featured: false, desc: '',
    image: data.signatureCoffee.image || ''
  })
}
function removePackage(i) { data.signatureCoffee.packages.splice(i, 1) }

/**
 * Which upload is in flight, as a key rather than a boolean, so uploading one
 * package's photo does not put every other Upload button into a loading state.
 */
const uploading = ref('')

async function runUpload(key, file, assign) {
  if (!file) return
  uploading.value = key
  try {
    const result = await apiUpload(file)
    // The helper returns the URL already normalised onto the API's own image
    // route, so what is stored is what the website will fetch.
    assign(result.url)
    toast('Image uploaded — remember to publish')
  } catch (err) {
    toast('Upload failed: ' + (err.message || 'unknown error'), 'error')
  } finally {
    uploading.value = ''
  }
}

async function uploadShowcase(e) {
  const file = e.target.files?.[0]
  await runUpload('showcase', file, (url) => { data.signatureCoffee.image = url })
  // Cleared so choosing the same file again still fires a change event.
  e.target.value = ''
}

async function uploadPackageImage(e, i) {
  const file = e.target.files?.[0]
  await runUpload('pkg-' + i, file, (url) => {
    if (data.signatureCoffee.packages[i]) data.signatureCoffee.packages[i].image = url
  })
  e.target.value = ''
}

function addTestimonial()      { data.testimonialCards.push({ quote: '', name: '', role: '', avatar: '' }) }
function removeTestimonial(i)  { data.testimonialCards.splice(i, 1) }
function moveTestimonial(i, d) {
  const j = i + d
  if (j < 0 || j >= data.testimonialCards.length) return
  ;[data.testimonialCards[i], data.testimonialCards[j]] = [data.testimonialCards[j], data.testimonialCards[i]]
}

onMounted(loadContent)
</script>
