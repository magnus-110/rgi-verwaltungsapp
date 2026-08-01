import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { decode, Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts'

const MAX_EDGE = 1600 // reicht für gut lesbaren 20x20 cm Ausdruck (~200 dpi)
const JPEG_QUALITY = 82

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let body: any = {}
    try { body = await req.json() } catch { /* no body */ }
    const dryRun = body?.dry_run === true
    const buildingId: string | undefined = body?.building_id

    let q = supabase.from('key_tags').select('id, tag_number, photo_path').not('photo_path', 'is', null)
    if (buildingId) q = q.eq('building_id', buildingId)
    const { data: tags, error } = await q
    if (error) return json({ error: error.message }, 500)

    const results: any[] = []
    let savedBytes = 0

    for (const tag of tags ?? []) {
      const path = tag.photo_path as string
      try {
        const { data: file, error: dlErr } = await supabase.storage.from('key-files').download(path)
        if (dlErr || !file) { results.push({ path, status: 'download_failed', error: dlErr?.message }); continue }

        const originalBytes = new Uint8Array(await file.arrayBuffer())
        const lower = path.toLowerCase()
        if (!/\.(jpe?g|png|webp)$/.test(lower)) { results.push({ path, status: 'skipped_not_image' }); continue }

        const img = await decode(originalBytes)
        if (!(img instanceof Image)) { results.push({ path, status: 'skipped_animated' }); continue }

        const maxSide = Math.max(img.width, img.height)
        if (maxSide <= MAX_EDGE && originalBytes.length < 400_000) {
          results.push({ path, status: 'already_small', width: img.width, height: img.height })
          continue
        }
        if (maxSide > MAX_EDGE) {
          const scale = MAX_EDGE / maxSide
          img.resize(Math.round(img.width * scale), Math.round(img.height * scale))
        }

        const out = await img.encodeJPEG(JPEG_QUALITY)
        if (out.length >= originalBytes.length) {
          results.push({ path, status: 'no_gain', bytes: originalBytes.length })
          continue
        }

        if (dryRun) {
          results.push({ path, status: 'would_compress', from: originalBytes.length, to: out.length })
          savedBytes += originalBytes.length - out.length
          continue
        }

        const newPath = path.replace(/\.[^./]+$/, '') + '.jpg'
        const { error: upErr } = await supabase.storage
          .from('key-files')
          .upload(newPath, out, { contentType: 'image/jpeg', upsert: true })
        if (upErr) { results.push({ path, status: 'upload_failed', error: upErr.message }); continue }

        if (newPath !== path) {
          await supabase.from('key_tags').update({ photo_path: newPath }).eq('id', tag.id)
          await supabase.storage.from('key-files').remove([path])
        }

        savedBytes += originalBytes.length - out.length
        results.push({
          path: newPath,
          status: 'compressed',
          from: originalBytes.length,
          to: out.length,
          width: img.width,
          height: img.height,
        })
      } catch (e) {
        results.push({ path, status: 'error', error: (e as Error).message })
      }
    }

    return json({ total: tags?.length ?? 0, saved_bytes: savedBytes, dry_run: dryRun, results })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
