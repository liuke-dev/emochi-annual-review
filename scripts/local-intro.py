from pathlib import Path
import json,subprocess,wave,sys,shutil
import numpy as np
if len(sys.argv)!=3: raise SystemExit('Usage: python scripts/local-intro.py PLAN_JSON OUTPUT_DIR')
plan=json.loads(Path(sys.argv[1]).read_text());ROOT=Path(sys.argv[2]).resolve()
repo=Path(__file__).resolve().parents[1]
if ROOT==repo or repo in ROOT.parents:raise SystemExit('Personal audio must be outside the Git checkout')
ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
if not isinstance(plan.get('sourceKey'),str) or len(plan.get('scenes',[]))!=5:raise SystemExit('Invalid narration plan')
SR=44100;FF=shutil.which('ffmpeg')
if not FF or not shutil.which('say'):raise SystemExit('Local synthesis requires macOS say and ffmpeg')
def run(args):return subprocess.run(args,check=True,capture_output=True)
def decode(p):return np.frombuffer(run([FF,'-v','error','-threads','1','-i',str(p),'-f','f32le','-ac','1','-ar',str(SR),'-']).stdout,dtype='<f4').copy()
def trim(p):
 x=decode(p);assert len(x)>SR//3
 frame=round(SR*.01);energy=np.array([np.sqrt(np.mean(x[i:i+frame]**2)) for i in range(0,len(x),frame)])
 active=np.flatnonzero(energy>.0015);assert len(active)>2
 start=max(0,active[0]*frame-round(.035*SR));end=min(len(x),(active[-1]+1)*frame+round(.09*SR));x=x[start:end]
 n=round(.008*SR);x[:n]*=np.linspace(0,1,n);x[-n:]*=np.linspace(1,0,n)
 return x
def silence(t):return np.zeros(round(t*SR),np.float32)
def wav(p,x):
 with wave.open(str(p),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(SR);f.writeframes((np.clip(x,-.999,.999)*32767).astype('<i2').tobytes())
def meter(p):
 log=run([FF,'-hide_banner','-threads','1','-i',str(p),'-af','loudnorm=I=-18.5:TP=-2.5:LRA=8:print_format=json','-f','null','-']).stderr.decode();return json.loads(log[log.rfind('{'):log.rfind('}')+1])
for i,scene in enumerate(plan['scenes']):
 if len(scene.get('parts',[]))!=2:raise SystemExit('Each scene requires two speech parts')
 for j,text in enumerate(scene['parts']):
  f=ROOT/f'{i}-{j}.txt';f.write_text(text);f.chmod(0o600)
  run(['say','-v','Tingting','-r','165','-f',str(f),'-o',str(ROOT/f'{i}-{j}-local.aiff')])
report=[];assembled=[]
for i in range(5):
 lead,body=trim(ROOT/f'{i}-0-local.aiff'),trim(ROOT/f'{i}-1-local.aiff')
 prefix=.6 if i in [1,2,3] else .42;gap=.9 if i in [1,2,3] else .55
 clean=np.concatenate([silence(prefix),lead,silence(gap),body,silence(.65)])
 raw=ROOT/f'cue-{i}-dry.wav';wav(raw,clean)
 radio=ROOT/f'cue-{i}-radio.wav'
 filters='[0:a]asplit=2[d][r];[d]highpass=f=75,lowpass=f=9500[dry];[r]highpass=f=260,lowpass=f=3900,acompressor=threshold=0.12:ratio=1.8:attack=12:release=160:knee=2.5:makeup=1,aecho=0.85:0.9:34|76:0.07|0.025[radio];[dry][radio]amix=inputs=2:weights=0.64 0.36:normalize=0:duration=longest[out]'
 run([FF,'-v','error','-y','-threads','1','-i',str(raw),'-filter_complex',filters,'-map','[out]','-c:a','pcm_s16le',str(radio)])
 x=decode(radio);t=np.arange(len(x))/SR;rng=np.random.default_rng(6200+i)
 # Air/communication-floor is very low. Do not mask syllables with distortion.
 fx=rng.standard_normal(len(x))*.00065+np.sin(2*np.pi*97*t)*.0004
 env=np.minimum(1,t/.15)*np.minimum(1,(len(x)/SR-t)/.22);fx*=env
 def chirp(start,duration,freq,amp):
  a=round(start*SR);n=round(duration*SR);tt=np.arange(n)/SR;fx[a:a+n]+=amp*np.sin(2*np.pi*freq*tt)*np.hanning(n)
 if i==0:chirp(.05,.09,820,.015);chirp(.17,.08,1090,.012)
 if i==4:chirp(len(x)/SR-.30,.12,660,.009)
 mixed=ROOT/f'cue-{i}-mixed.wav';wav(mixed,x+fx)
 m=meter(mixed);norm=f"loudnorm=I=-18.5:TP=-2.5:LRA=8:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
 out=ROOT/f'intro-space-{i}.mp3';run([FF,'-v','error','-y','-threads','1','-i',str(mixed),'-af',norm,'-ar','44100','-ac','1','-b:a','128k',str(out)])
 y=decode(out);m2=meter(out);assert len(y)>SR*2 and float(m2['input_tp'])<-.5
 report.append({'file':out.name,'duration':len(y)/SR,'lufs':float(m2['input_i']),'peakDbTP':float(m2['input_tp']),'leadStart':prefix,'bodyStart':prefix+len(lead)/SR+gap,'pauseSeconds':gap,'bytes':out.stat().st_size})
 assembled.extend([y,silence(.76)])
 wav(ROOT/'preview-complete.wav',np.concatenate(assembled))
run([FF,'-v','error','-y','-i',str(ROOT/'preview-complete.wav'),'-b:a','160k',str(ROOT/'preview-complete.mp3')])
(ROOT/'bundle.json').write_text(json.dumps({'sourceKey':plan['sourceKey'],'files':report,'engine':'macOS Tingting, entirely on device'},indent=2))
(ROOT/'bundle.json').chmod(0o600)
(ROOT/'audio-report.json').write_text(json.dumps({'engine':'macOS Tingting, entirely on device','effects':'64% natural voice + 36% 260–3900Hz radio, light 34/76ms reflection, quiet air floor, short intercom tones','files':report,'totalSeconds':sum(x['duration'] for x in report)},indent=2))
print(json.dumps({'files':report,'totalSeconds':sum(x['duration'] for x in report)}))
