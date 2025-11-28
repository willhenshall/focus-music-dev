import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const storageFilesToDelete = [
  // Old timestamp-based files
  'track_1762005899511_mdiuwzsrm.mp3',
  'track_1762005913170_hb3wacdkb.mp3',
  'track_1762005927821_q2ywclub8.mp3',
  'track_1762005941640_ity8dtmce.mp3',
  'track_1762005954953_nmptgqlhj.mp3',
  'track_1762005967974_5ikug6e0z.mp3',
  'track_1762005981279_qa32ya3hf.mp3',
  'track_1762005994055_vrk3f6yxo.mp3',
  'track_1762006007471_z5aqhkzrq.mp3',
  'track_1762006020421_2d5d0uvvv.mp3',
  'track_1762007769294_1iisodnmx.mp3',
  'track_1762007782677_cszkelvto.mp3',
  'track_1762007796175_4v59swkw0.mp3',
  'track_1762007809627_6w5fm1a7j.mp3',
  'track_1762007823364_zyns6d6ye.mp3',
  'track_1762007836987_2u5t03eue.mp3',
  'track_1762007851146_wfukpgjd3.mp3',
  'track_1762007865261_zp597nri6.mp3',
  'track_1762007878635_gdn2uhptp.mp3',
  'track_1762007893181_yo1b49lhh.mp3',
  'track_1762008016733_8h4ux9t7s.mp3',
  'track_1762008030069_ffxdr9n9j.mp3',
  'track_1762008043378_40wp6ucyl.mp3',
  'track_1762008056312_3itihrkb9.mp3',
  'track_1762008068901_puxg7pbsx.mp3',
  'track_1762008081882_j4vepwt94.mp3',
  'track_1762008095052_kbbms8i3x.mp3',
  'track_1762008107346_fd6c0q2x1.mp3',
  'track_1762008121317_47aarrxwe.mp3',
  'track_1762008135162_4tgbdic4y.mp3',
  // New sequential ID files
  '179095.mp3',
  '179096.mp3',
  '179097.mp3',
  '179098.mp3',
  '179099.mp3',
  '179100.mp3',
  '179101.mp3',
  '179102.mp3',
  '179103.mp3',
];

const sidecarFilesToDelete = [
  // Old timestamp-based sidecars
  'track_1762005899511_mdiuwzsrm.json',
  'track_1762005913170_hb3wacdkb.json',
  'track_1762005927821_q2ywclub8.json',
  'track_1762005941640_ity8dtmce.json',
  'track_1762005954953_nmptgqlhj.json',
  'track_1762005967974_5ikug6e0z.json',
  'track_1762005981279_qa32ya3hf.json',
  'track_1762005994055_vrk3f6yxo.json',
  'track_1762006007471_z5aqhkzrq.json',
  'track_1762006020421_2d5d0uvvv.json',
  'track_1762007769294_1iisodnmx.json',
  'track_1762007782677_cszkelvto.json',
  'track_1762007796175_4v59swkw0.json',
  'track_1762007809627_6w5fm1a7j.json',
  'track_1762007823364_zyns6d6ye.json',
  'track_1762007836987_2u5t03eue.json',
  'track_1762007851146_wfukpgjd3.json',
  'track_1762007865261_zp597nri6.json',
  'track_1762007878635_gdn2uhptp.json',
  'track_1762007893181_yo1b49lhh.json',
  'track_1762008016733_8h4ux9t7s.json',
  'track_1762008030069_ffxdr9n9j.json',
  'track_1762008043378_40wp6ucyl.json',
  'track_1762008056312_3itihrkb9.json',
  'track_1762008068901_puxg7pbsx.json',
  'track_1762008081882_j4vepwt94.json',
  'track_1762008095052_kbbms8i3x.json',
  'track_1762008107346_fd6c0q2x1.json',
  'track_1762008121317_47aarrxwe.json',
  'track_1762008135162_4tgbdic4y.json',
  // New sequential ID sidecars
  '179095.json',
  '179096.json',
  '179097.json',
  '179098.json',
  '179099.json',
  '179100.json',
  '179101.json',
  '179102.json',
  '179103.json',
];

async function deleteStorageFiles() {
  console.log('Deleting audio files from storage...\n');

  const { data, error } = await supabase.storage
    .from('audio-files')
    .remove(storageFilesToDelete);

  if (error) {
    console.error('Error deleting audio files:', error);
  } else {
    console.log(`✓ Successfully deleted ${storageFilesToDelete.length} audio files`);
  }

  console.log('\nDeleting sidecar JSON files from storage...\n');

  const { data: sidecarData, error: sidecarError } = await supabase.storage
    .from('audio-sidecars')
    .remove(sidecarFilesToDelete);

  if (sidecarError) {
    console.error('Error deleting sidecars:', sidecarError);
  } else {
    console.log(`✓ Successfully deleted ${sidecarFilesToDelete.length} sidecar files`);
  }

  console.log('\n✅ Storage cleanup complete!');
}

deleteStorageFiles().catch(console.error);
