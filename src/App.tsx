import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import {
  Activity, AlertTriangle, ArrowUpRight, CalendarDays, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, Crosshair, Download, Flame, Layers3, MapPin, Menu,
  Radio, Search, Satellite, SlidersHorizontal, Sparkles, X
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FireObservation } from './types';

type Tab = 'Overview' | 'Fire map' | 'Activity calendar' | 'Analytics' | 'Alert center' | 'Methodology';

const demo: FireObservation[] = [
  ['S-001',11.0168,76.9558,'2026-11-12T04:21:00Z','VIIRS',91,18.4,'Tamil Nadu'],
  ['S-002',11.1245,77.0121,'2026-11-12T04:18:00Z','MODIS',78,12.2,'Tamil Nadu'],
  ['S-003',10.9253,77.0832,'2026-11-12T04:14:00Z','VIIRS',96,24.8,'Tamil Nadu'],
  ['S-004',11.3221,76.7414,'2026-11-12T04:11:00Z','VIIRS',83,9.6,'Tamil Nadu'],
  ['S-005',10.8136,76.9025,'2026-11-12T04:08:00Z','MODIS',67,7.1,'Tamil Nadu'],
  ['S-006',11.2105,77.1837,'2026-11-12T04:03:00Z','VIIRS',88,16.7,'Tamil Nadu'],
  ['S-007',10.7372,77.0212,'2026-11-11T23:55:00Z','VIIRS',94,21.3,'Tamil Nadu'],
  ['S-008',11.4361,76.8123,'2026-11-11T23:48:00Z','MODIS',72,11.1,'Tamil Nadu'],
  ['S-009',12.2958,76.6394,'2026-11-11T22:40:00Z','VIIRS',88,13.1,'Karnataka'],
  ['S-010',9.9252,78.1198,'2026-11-11T21:50:00Z','MODIS',75,8.4,'Tamil Nadu'],
  ['S-011',10.0677,77.0595,'2026-11-10T04:32:00Z','VIIRS',97,28.9,'Tamil Nadu'],
  ['S-012',11.6643,78.146,'2026-11-10T04:22:00Z','MODIS',81,14.2,'Tamil Nadu'],
  ['S-013',13.0827,80.2707,'2026-11-09T22:11:00Z','VIIRS',86,17.5,'Tamil Nadu'],
  ['S-014',10.3624,77.9695,'2026-11-09T04:19:00Z','MODIS',69,6.2,'Tamil Nadu'],
  ['S-015',12.9716,77.5946,'2026-11-08T23:17:00Z','VIIRS',93,25.4,'Karnataka'],
  ['S-016',10.7867,78.7047,'2026-11-08T04:09:00Z','VIIRS',82,10.1,'Tamil Nadu'],
  ['S-017',8.7642,78.1348,'2026-11-07T21:32:00Z','MODIS',77,11.9,'Tamil Nadu'],
  ['S-018',11.341,76.795,'2026-11-06T04:33:00Z','VIIRS',90,19.2,'Tamil Nadu'],
  ['S-019',11.1271,78.6569,'2026-11-05T03:53:00Z','MODIS',73,9.5,'Tamil Nadu'],
  ['S-020',10.7905,78.7047,'2026-11-04T23:31:00Z','VIIRS',85,15.6,'Tamil Nadu'],
  ['S-021',9.1386,77.7081,'2026-11-03T05:06:00Z','VIIRS',89,20.2,'Tamil Nadu'],
  ['S-022',12.2253,79.0747,'2026-11-02T04:12:00Z','MODIS',70,7.8,'Tamil Nadu'],
  ['S-023',11.5016,79.326,'2026-11-01T22:42:00Z','VIIRS',92,22.1,'Tamil Nadu'],
].map(([id,latitude,longitude,acquired,satellite,confidence,frp,region]) => ({
  id, latitude, longitude, acquired, satellite, confidence, frp, region, source: 'sample'
} as FireObservation));

const chartSeed = [
  {day:'30 Oct',viirs:1,modis:1},{day:'31 Oct',viirs:2,modis:0},{day:'1 Nov',viirs:3,modis:1},
  {day:'2 Nov',viirs:2,modis:2},{day:'3 Nov',viirs:4,modis:1},{day:'4 Nov',viirs:3,modis:2},
  {day:'5 Nov',viirs:4,modis:2},{day:'6 Nov',viirs:5,modis:2},{day:'7 Nov',viirs:3,modis:3},
  {day:'8 Nov',viirs:5,modis:2},{day:'9 Nov',viirs:4,modis:3},{day:'10 Nov',viirs:6,modis:3},
  {day:'11 Nov',viirs:7,modis:4},{day:'12 Nov',viirs:10,modis:5}
];

function FlyTo({center, zoom}:{center:[number,number];zoom:number}) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, zoom, {duration: 1.1}); }, [center, zoom, map]);
  return null;
}

function App() {
  const [fires, setFires] = useState<FireObservation[]>(demo);
  const [source, setSource] = useState<'sample'|'NASA FIRMS'>('sample');
  const [tab, setTab] = useState<Tab>('Overview');
  const [sensor, setSensor] = useState('All sensors');
  const [area, setArea] = useState('Tamil Nadu');
  const [query, setQuery] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/fires').then(r => r.ok ? r.json() : Promise.reject()).then(data => {
      if (data.fires?.length) { setFires(data.fires); setSource(data.source); }
    }).catch(() => setError('Backend offline · using bundled demonstration data'));
  }, []);

  const visible = useMemo(() => fires.filter(f =>
    (sensor === 'All sensors' || f.satellite === sensor) &&
    (area === 'Global' || f.region === area) &&
    (!query || `${f.region} ${f.satellite} ${f.id}`.toLowerCase().includes(query.toLowerCase()))
  ), [fires, sensor, area, query]);

  const stats = {
    total: visible.length,
    viirs: visible.filter(f => f.satellite === 'VIIRS').length,
    modis: visible.filter(f => f.satellite === 'MODIS').length,
    high: visible.filter(f => f.confidence >= 80).length,
    frp: visible.reduce((sum, f) => sum + f.frp, 0) / Math.max(1, visible.length)
  };
  const center: [number, number] = area === 'Global' ? [17, 28] : area === 'Karnataka' ? [12.7, 76.9] : [11.0168, 76.9558];

  async function refresh() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/fires?refresh=true');
      if (!response.ok) throw new Error((await response.json()).detail || 'Refresh failed');
      const data = await response.json(); setFires(data.fires); setSource(data.source);
    } catch (e) { setError(e instanceof Error ? e.message : 'Refresh failed'); }
    finally { setLoading(false); }
  }

  async function downloadReport(format: 'csv'|'pdf') {
    try {
      const response = await fetch('/api/reports', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({region:area,format})});
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a');
      link.href = url; link.download = `firewatch-report.${format}`; link.click(); URL.revokeObjectURL(url);
    } catch {
      if (format === 'pdf') { setError('Start the backend to generate PDF reports.'); return; }
      const rows = [['id','latitude','longitude','acquired_utc','sensor','confidence','frp_mw','region','source'], ...visible.map(f => [f.id,f.latitude,f.longitude,f.acquired,f.satellite,f.confidence,f.frp,f.region,f.source])];
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})); link.download='firewatch-report.csv'; link.click(); URL.revokeObjectURL(link.href);
    }
  }

  const nav: [Tab, typeof Activity][] = [['Overview',Activity],['Fire map',MapPin],['Activity calendar',CalendarDays],['Analytics',Layers3],['Alert center',AlertTriangle],['Methodology',CircleHelp]];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'open':''}`}>
      <div className="brand"><span className="brand-icon"><Flame size={19} fill="currentColor"/></span><div><strong>FIREWATCH <em>AI</em></strong><small>EARTH INTELLIGENCE</small></div><button className="icon-button close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <span className="section-label">WORKSPACE</span>
      <nav>{nav.map(([name,Icon]) => <button key={name} className={tab===name?'active':''} onClick={()=>{setTab(name);setMobileNav(false)}}><Icon size={17}/><span>{name}</span>{name==='Alert center'&&<b>3</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="status-card"><div><i className="pulse"/> SYSTEM STATUS <span>{source==='NASA FIRMS'?'LIVE':'DEMO'}</span></div><strong>{source==='NASA FIRMS'?'NASA FIRMS connected':'Sample mode active'}</strong><div className="status-line"><i/></div><small>MODIS + VIIRS processing ready</small></div><div className="profile"><span>FW</span><div><strong>Firewatch Analyst</strong><small>Research workspace</small></div><ChevronDown size={14}/></div></div>
    </aside>
    {mobileNav && <button className="scrim" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
    <main>
      <header className="topbar"><div><button className="icon-button menu" onClick={()=>setMobileNav(true)}><Menu size={20}/></button><span>Monitoring</span><i>/</i><strong>{tab}</strong></div><div><span className="feed"><i className="pulse"/>{source==='NASA FIRMS'?'LIVE FEED':'DEMO FEED'}</span><span className="user-avatar">A</span></div></header>
      <div className="page">
        <div className="page-heading"><div><span className="eyebrow">NASA SPACE APPS · 2026</span><h1>{tab === 'Overview' ? 'Fire intelligence, in focus.' : tab}</h1><p>{subtitle(tab)}</p></div><div className="heading-actions"><button className="button secondary" onClick={()=>downloadReport('csv')}><Download size={15}/> Export CSV</button><button className="button primary" onClick={refresh} disabled={loading}><Radio size={15} className={loading?'spin':''}/>{loading?'Refreshing…':'Refresh data'}</button></div></div>
        <div className={`data-banner ${source==='sample'?'demo':''}`}><Satellite size={16}/><span><b>{source==='sample'?'DEMONSTRATION DATA':'NASA FIRMS DATA'}</b> · {source==='sample'?'Bundled synthetic observations — not live NASA detections':'Retrieved by the backend using a server-side FIRMS key'}</span><button onClick={()=>setTab('Methodology')}>Data notes <ChevronRight size={13}/></button></div>
        {error && <div className="error-banner"><AlertTriangle size={15}/>{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}
        <div className="filterbar"><div className="filters"><label><MapPin size={15}/><select value={area} onChange={e=>setArea(e.target.value)}><option>Tamil Nadu</option><option>Karnataka</option><option>Global</option></select><ChevronDown size={13}/></label><span className="divider"/>{['All sensors','VIIRS','MODIS'].map(s=><button key={s} className={sensor===s?'selected':''} onClick={()=>setSensor(s)}><i className={`sensor-dot ${s.toLowerCase().split(' ')[0]}`}/>{s}</button>)}</div><div className="search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search observations"/><button title="Toggle sensor" onClick={()=>setSensor(sensor==='All sensors'?'VIIRS':'All sensors')}><SlidersHorizontal size={14}/></button></div></div>

        {tab === 'Overview' && <Overview fires={visible} stats={stats} area={area} center={center} chart={chartSeed} setTab={setTab}/>} 
        {tab === 'Fire map' && <FireMap fires={visible} area={area} center={center}/>} 
        {tab === 'Activity calendar' && <CalendarView fires={visible} area={area}/>} 
        {tab === 'Analytics' && <Analytics fires={visible} stats={stats}/>} 
        {tab === 'Alert center' && <Alerts fires={visible} area={area}/>} 
        {tab === 'Methodology' && <Methodology source={source}/>} 
        <footer><span><Flame size={13}/> FIREWATCH AI · NASA SPACE APPS 2026</span><p>For research and situational awareness. Not an operational emergency service.</p><button onClick={()=>setTab('Methodology')}>Methodology & limitations</button></footer>
      </div>
    </main>
  </div>;
}

function subtitle(tab: Tab) {
  return ({'Overview':'A harmonized view of satellite fire activity across sensors and time.','Fire map':'Explore geolocated MODIS and VIIRS observations.','Activity calendar':'Read daily activity without losing sensor context.','Analytics':'Compare sensor signals and temporal patterns.','Alert center':'Review explainable monitoring signals that warrant attention.','Methodology':'See exactly how observations are standardized and aggregated.'})[tab];
}

function Metric({icon,label,value,note,tone}:{icon:React.ReactNode;label:string;value:string;note:string;tone:string}) {
  return <article className={`metric ${tone}`}><div><span>{icon}</span><small>{label}</small><i>•••</i></div><strong>{value}</strong><footer><span>{note}</span><div className="spark">{[20,34,28,46,37,58,45,68,54,82,63,91].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></footer></article>;
}

function FireMapCanvas({fires,center,large=false}:{fires:FireObservation[];center:[number,number];large?:boolean}) {
  return <div className={large?'map-canvas large':'map-canvas'}><MapContainer center={center} zoom={center[0]===17?3:7} scrollWheelZoom className="leaflet-map"><FlyTo center={center} zoom={center[0]===17?3:7}/><TileLayer attribution='&copy; OpenStreetMap · CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"/>{fires.map(f=><CircleMarker key={f.id} center={[f.latitude,f.longitude]} radius={f.satellite==='VIIRS'?7:9} pathOptions={{color:f.satellite==='VIIRS'?'#54d6c9':'#f3a24b',fillColor:f.satellite==='VIIRS'?'#54d6c9':'#f3a24b',fillOpacity:.85,weight:1.5}}><Popup><b>{f.satellite} · {f.region}</b><br/>{f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}<br/>Confidence {f.confidence}% · FRP {f.frp} MW<br/>{new Date(f.acquired).toUTCString()}<br/><small>{f.source==='sample'?'SAMPLE OBSERVATION':'NASA FIRMS'}</small></Popup></CircleMarker>)}</MapContainer><div className="floating-legend"><span><i className="sensor-dot viirs"/>VIIRS · 375 m</span><span><i className="sensor-dot modis"/>MODIS · 1 km</span></div></div>;
}

function Overview({fires,stats,area,center,chart,setTab}:{fires:FireObservation[];stats:{total:number;viirs:number;modis:number;high:number;frp:number};area:string;center:[number,number];chart:{day:string;viirs:number;modis:number}[];setTab:(t:Tab)=>void}) {
  return <>
    <section className="metrics"><Metric icon={<Flame size={17}/>} label="DETECTIONS IN VIEW" value={String(stats.total)} note="Across both sensors" tone="orange"/><Metric icon={<Satellite size={17}/>} label="VIIRS OBSERVATIONS" value={String(stats.viirs)} note="375 m nominal pixels" tone="cyan"/><Metric icon={<Satellite size={17}/>} label="MODIS OBSERVATIONS" value={String(stats.modis)} note="1 km nominal pixels" tone="blue"/><Metric icon={<Crosshair size={17}/>} label="HIGH CONFIDENCE" value={String(stats.high)} note="Confidence ≥ 80" tone="green"/></section>
    <section className="primary-grid"><article className="panel map-panel"><PanelHead title="Satellite fire map" subtitle={`${area} · sensor-specific detections`} action={<button onClick={()=>setTab('Fire map')}>EXPAND MAP <ChevronRight size={14}/></button>}/><FireMapCanvas fires={fires} center={center}/></article><article className="panel trend-panel"><PanelHead title="Activity trend" subtitle="Daily detections · 14-day demo window" action={<span className="period">14 days <ChevronDown size={12}/></span>}/><div className="chart-key"><span><i className="sensor-dot viirs"/>VIIRS</span><span><i className="sensor-dot modis"/>MODIS</span></div><TrendChart data={chart}/><div className="trend-summary"><div><span>COMBINED VIEW</span><strong>{stats.total} <small>records</small></strong></div><span><ArrowUpRight size={14}/> Sensor counts retained separately</span></div></article></section>
    <section className="secondary-grid"><MiniCalendar fires={fires} onOpen={()=>setTab('Activity calendar')}/><Anomaly fires={fires} area={area} onOpen={()=>setTab('Analytics')}/></section>
    <ObservationTable fires={fires.slice(0,6)} onAll={()=>setTab('Fire map')}/>
  </>;
}

function PanelHead({title,subtitle,action}:{title:string;subtitle:string;action?:React.ReactNode}) { return <div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>; }

function TrendChart({data}:{data:{day:string;viirs:number;modis:number}[]}) { return <div className="trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:8,right:4,left:-27,bottom:0}}><defs><linearGradient id="viirsFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#54d6c9" stopOpacity={.25}/><stop offset="1" stopColor="#54d6c9" stopOpacity={0}/></linearGradient><linearGradient id="modisFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f3a24b" stopOpacity={.18}/><stop offset="1" stopColor="#f3a24b" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#27333e" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="day" tick={{fill:'#73808b',fontSize:10}} axisLine={false} tickLine={false} minTickGap={24}/><YAxis tick={{fill:'#73808b',fontSize:10}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'#101b25',border:'1px solid #2b3944',borderRadius:8,fontSize:12}}/><Area type="monotone" dataKey="viirs" name="VIIRS" stroke="#54d6c9" strokeWidth={2} fill="url(#viirsFill)"/><Area type="monotone" dataKey="modis" name="MODIS" stroke="#f3a24b" strokeWidth={2} fill="url(#modisFill)"/></AreaChart></ResponsiveContainer></div>; }

function MiniCalendar({fires,onOpen}:{fires:FireObservation[];onOpen:()=>void}) {
  const counts = useMemo(()=>fires.reduce<Record<number,number>>((a,f)=>{const d=new Date(f.acquired).getUTCDate();a[d]=(a[d]||0)+1;return a},{}),[fires]);
  return <article className="panel calendar-card"><PanelHead title="Activity calendar" subtitle="November 2026 · daily detections" action={<span className="calendar-nav"><ChevronLeft size={14}/><ChevronRight size={14}/></span>}/><div className="calendar-grid">{['M','T','W','T','F','S','S'].map((d,i)=><span className="weekday" key={i}>{d}</span>)}{Array(6).fill(0).map((_,i)=><span key={`x${i}`}/>)}{Array.from({length:30},(_,i)=>i+1).map(d=><button key={d} className={`${counts[d]>=5?'hot':counts[d]>=2?'warm':counts[d]?'low':''} ${d===12?'selected':''}`}><span>{d}</span>{counts[d]?<i/>:null}</button>)}</div><div className="calendar-legend"><span><i className="low"/>Low</span><span><i className="warm"/>Elevated</span><span><i className="hot"/>Unusual</span><button onClick={onOpen}>Open calendar <ArrowUpRight size={13}/></button></div></article>;
}

function Anomaly({fires,area,onOpen}:{fires:FireObservation[];area:string;onOpen:()=>void}) {
  const current=fires.filter(f=>new Date(f.acquired).getUTCDate()===12).length; const baseline=Math.max(1,Math.round((fires.length-current)/Math.max(1,new Set(fires.map(f=>f.acquired.slice(0,10))).size-1))); const pct=Math.round((current-baseline)/baseline*100);
  return <article className="panel anomaly"><PanelHead title="Unusual activity" subtitle="Relative to available recent days" action={<span className="review"><i/>REVIEW</span>}/><div className="anomaly-main"><div className="ring"><strong>{pct>0?'+':''}{pct}<small>%</small></strong><span>VS BASELINE</span></div><div><h3><MapPin size={14}/>{area} cluster</h3><p>Latest-day detections differ from the recent daily reference. This is a descriptive signal, not a fire-risk forecast.</p><small>UPDATED FROM {fires.length} VISIBLE RECORDS</small></div></div><div className="baseline"><div><span>REFERENCE</span><strong>{baseline}<small>/ day</small></strong></div><i><span style={{width:`${Math.min(100,current/Math.max(1,baseline)*50)}%`}}/></i><div><span>LATEST DAY</span><strong>{current}<small> records</small></strong></div></div><button className="wide-link" onClick={onOpen}>Review anomaly details <ArrowUpRight size={14}/></button></article>;
}

function ObservationTable({fires,onAll}:{fires:FireObservation[];onAll?:()=>void}) { return <article className="panel observations"><PanelHead title="Recent observations" subtitle="Latest records in the selected view" action={onAll?<button onClick={onAll}>View all <ArrowUpRight size={13}/></button>:undefined}/><div className="table-wrap"><table><thead><tr><th>OBSERVATION</th><th>SENSOR</th><th>ACQUIRED (UTC)</th><th>COORDINATES</th><th>CONFIDENCE</th><th>FRP</th><th>SOURCE</th></tr></thead><tbody>{fires.map(f=><tr key={f.id}><td><span className="observation-name"><i><Flame size={14}/></i><span><b>{f.region} detection</b><small>{f.id}</small></span></span></td><td><span className={`sensor-pill ${f.satellite.toLowerCase()}`}><i/>{f.satellite}</span></td><td>{new Date(f.acquired).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})}</td><td className="coords">{f.latitude.toFixed(4)}°, {f.longitude.toFixed(4)}°</td><td><span className={f.confidence>=80?'confidence high':'confidence'}>{f.confidence}%</span></td><td>{f.frp.toFixed(1)} MW</td><td><span className="source"><i/>{f.source==='sample'?'Sample':'FIRMS'}</span></td></tr>)}</tbody></table></div></article>; }

function FireMap({fires,area,center}:{fires:FireObservation[];area:string;center:[number,number]}) { return <><article className="panel full-map"><PanelHead title="Geospatial observation explorer" subtitle={`${area} · click any hotspot for source details`} action={<span className="record-count"><i/>{fires.length} RECORDS</span>}/><FireMapCanvas fires={fires} center={center} large/><div className="map-caption"><span>Coordinates preserved at source precision</span><span>UTC acquisition timestamps</span><span>Sensor provenance retained</span></div></article><ObservationTable fires={fires}/></>; }

function CalendarView({fires,area}:{fires:FireObservation[];area:string}) {
  const [day,setDay]=useState(12); const counts=fires.reduce<Record<number,FireObservation[]>>((a,f)=>{const d=new Date(f.acquired).getUTCDate();(a[d]??=[]).push(f);return a},{}); const selected=counts[day]||[];
  return <div className="calendar-page"><article className="panel calendar-large"><PanelHead title="November activity calendar" subtitle={`${area} · choose a day to inspect records`} action={<span className="calendar-nav"><ChevronLeft size={14}/> November 2026 <ChevronRight size={14}/></span>}/><div className="calendar-grid large">{['MON','TUE','WED','THU','FRI','SAT','SUN'].map((d,i)=><span className="weekday" key={i}>{d}</span>)}{Array(6).fill(0).map((_,i)=><span key={`x${i}`}/>)}{Array.from({length:30},(_,i)=>i+1).map(d=><button key={d} onClick={()=>setDay(d)} className={`${(counts[d]?.length||0)>=5?'hot':(counts[d]?.length||0)>=2?'warm':counts[d]?'low':''} ${day===d?'selected':''}`}><span>{d}</span><small>{counts[d]?.length?`${counts[d].length} records`:''}</small>{counts[d]?<i/>:null}</button>)}</div></article><aside className="panel day-detail"><span className="eyebrow">SELECTED DATE</span><h2>{day} November 2026</h2><p>{area} · source records by sensor</p><div className="day-sensor"><span><i className="sensor-dot viirs"/>VIIRS</span><strong>{selected.filter(f=>f.satellite==='VIIRS').length}</strong></div><div className="day-sensor"><span><i className="sensor-dot modis"/>MODIS</span><strong>{selected.filter(f=>f.satellite==='MODIS').length}</strong></div><div className="day-total"><span>TOTAL DETECTIONS</span><strong>{selected.length}</strong></div><div className="note"><CircleHelp size={15}/><p>Counts remain sensor-specific because MODIS and VIIRS have different spatial resolutions and detection characteristics.</p></div></aside></div>;
}

function Analytics({fires,stats}:{fires:FireObservation[];stats:{total:number;viirs:number;modis:number;high:number;frp:number}}) { return <><section className="metrics"><Metric icon={<Flame size={17}/>} label="OBSERVATIONS" value={String(stats.total)} note="Visible source records" tone="orange"/><Metric icon={<Satellite size={17}/>} label="VIIRS" value={String(stats.viirs)} note="Count kept separate" tone="cyan"/><Metric icon={<Satellite size={17}/>} label="MODIS" value={String(stats.modis)} note="Count kept separate" tone="blue"/><Metric icon={<Activity size={17}/>} label="MEAN REPORTED FRP" value={`${stats.frp.toFixed(1)} MW`} note="Where available" tone="green"/></section><article className="panel analytics"><PanelHead title="Sensor activity comparison" subtitle="Daily detections shown independently" action={<span className="period">14 days <ChevronDown size={12}/></span>}/><div className="chart-large"><TrendChart data={chartSeed}/></div><div className="comparison"><div><i className="sensor-dot viirs"/><span>VIIRS records</span><strong>{stats.viirs}</strong><small>375 m nominal pixels</small></div><div><i className="sensor-dot modis"/><span>MODIS records</span><strong>{stats.modis}</strong><small>1 km nominal pixels</small></div><div><Layers3 size={12}/><span>Shared grid cells</span><strong>{new Set(fires.map(f=>`${Math.floor(f.latitude*10)}:${Math.floor(f.longitude*10)}`)).size}</strong><small>0.1° daily index</small></div></div></article><Analyst fires={fires}/><div className="note full"><CircleHelp size={15}/><p>Detection counts do not measure burned area or unique fires. The shared index supports consistent navigation while preserving sensor-specific statistics.</p></div></>; }

function Analyst({fires}:{fires:FireObservation[]}) {
  const [question,setQuestion]=useState('What changed in the latest fire activity?');
  const [answer,setAnswer]=useState(''); const [busy,setBusy]=useState(false);
  async function ask(){setBusy(true);try{const response=await fetch('/api/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,region:'Tamil Nadu'})});if(!response.ok)throw new Error();setAnswer((await response.json()).answer)}catch{const v=fires.filter(f=>f.satellite==='VIIRS').length,m=fires.filter(f=>f.satellite==='MODIS').length;setAnswer(`This view contains ${fires.length} clearly labelled sample observations: ${v} VIIRS and ${m} MODIS. The latest visible day is elevated relative to the short demonstration baseline. This is descriptive analysis, not a fire prediction or verified incident assessment.`)}finally{setBusy(false)}}
  return <article className="panel analyst"><div className="analyst-title"><span><Sparkles size={17}/></span><div><h2>Fire intelligence analyst</h2><p>Grounded in the observation records currently in view</p></div><b>DATA-GROUNDED</b></div><div className="analyst-body"><div className="prompt-chips">{['Summarize recent activity','Compare MODIS and VIIRS','Explain unusual activity'].map(q=><button key={q} onClick={()=>setQuestion(q)}>{q}</button>)}</div><div className="ask-row"><input aria-label="Ask the fire intelligence analyst" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()}/><button onClick={ask} disabled={busy}>{busy?'Analyzing…':'Analyze'} <ArrowUpRight size={13}/></button></div>{answer&&<div className="analyst-answer"><Sparkles size={15}/><p>{answer}</p></div>}</div></article>;
}

function Alerts({fires,area}:{fires:FireObservation[];area:string}) { const alerts=[{level:'review',title:'Activity above recent reference',text:'Latest-day detections are elevated relative to the available sample days. Inspect the contributing records before interpretation.',sensor:'VIIRS + MODIS'},{level:'elevated',title:'High-confidence thermal observations',text:`${fires.filter(f=>f.confidence>=90).length} visible observations have a confidence value of 90 or higher.`,sensor:'Sensor confidence'},{level:'info',title:'Dual-sensor coverage available',text:'Both MODIS and VIIRS source records contribute to the harmonized UTC-day and grid-cell view.',sensor:'Harmonized index'}]; return <><div className="alert-intro"><AlertTriangle size={20}/><div><strong>3 monitoring signals</strong><p>Statistical and observation signals for review · not confirmed incident reports</p></div><span>SAMPLE-DERIVED</span></div><section className="alert-list">{alerts.map(a=><article className="panel alert" key={a.title}><span className={`alert-icon ${a.level}`}><AlertTriangle size={17}/></span><div><div><h3>{a.title}</h3><span className={a.level}>{a.level.toUpperCase()}</span></div><small><MapPin size={12}/>{area} · 12 Nov 2026</small><p>{a.text}</p><footer><span>{a.sensor}</span><span>Explainable signal</span></footer></div><button>Inspect <ArrowUpRight size={13}/></button></article>)}</section></>; }

function Methodology({source}:{source:'sample'|'NASA FIRMS'}) { return <div className="methodology"><article className="panel method-hero"><span className="method-icon"><Layers3 size={21}/></span><span className="eyebrow">EXPLAINABLE DATA PIPELINE</span><h2>One shared index.<br/><em>Two distinct sensors.</em></h2><p>FIREWATCH AI aligns time and location for exploration while preserving every record's sensor provenance.</p><div className="flow"><span>MODIS</span><b>+</b><span>VIIRS</span><b>→</b><strong>HARMONIZED CALENDAR</strong></div></article><div className="method-grid">{[['01','Normalize safely','Map source fields into a canonical schema, parse acquisition timestamps as UTC, validate coordinates and retain source identifiers.'],['02','Index space and time','Assign each record to a configurable grid cell and UTC interval. The default demonstration uses 0.1° cells and calendar days.'],['03','Preserve sensor context','Keep MODIS and VIIRS counts, confidence and FRP summaries separate. Flag possible overlap without deleting nearby observations.'],['04','Explain unusual activity','Compare the latest activity with available historical days. Report baseline, percentage difference and z-score as statistical context.']].map(([n,t,d])=><article className="panel method-card" key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div><article className="panel limitations"><div><Satellite size={17}/><p><b>Current data mode</b><br/>{source==='sample'?'Bundled synthetic observations for demonstration. These are clearly labelled and must not be represented as NASA detections.':'NASA FIRMS observations retrieved through the server-side integration.'}</p></div><div><CircleHelp size={17}/><p><b>Scientific limitations</b><br/>Thermal detections are not fire perimeters. Cloud, overpass time, viewing geometry, land cover, resolution and algorithm differences affect detection.</p></div><div><Sparkles size={17}/><p><b>Interpretation boundary</b><br/>Anomaly scores describe observed activity. They are not ignition predictions, risk probabilities or verified incident reports.</p></div></article></div>; }

export default App;
