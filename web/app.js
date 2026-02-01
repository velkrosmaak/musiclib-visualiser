async function loadData() {
  const res = await fetch('../data/stats.json');
  const j = await res.json();
  return j.stats;
}

function renderSummary(stats) {
  const s = stats.summary;
  const out = [];
  out.push(`Total files found: ${s.total_files_found}`);
  out.push(`Files scanned: ${s.files_scanned}`);
  out.push(`Files with errors: ${s.files_with_errors}`);
  out.push(`Unique genres: ${s.unique_genres}`);
  out.push(`Unique artists: ${s.unique_artists}`);
  out.push(`Duration stats (mean): ${stats.durations ? (Math.round(stats.durations.mean) + 's') : 'N/A'}`);
  document.getElementById('summarytext').textContent = out.join('\n');
}

function populateGenreSelect(stats) {
  const sel = document.getElementById('genre_select');
  const genres = Object.keys(stats.genre_counts).sort((a,b)=>stats.genre_counts[b]-stats.genre_counts[a]);
  genres.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = `${g} (${stats.genre_counts[g]})`;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', e => {
    const g = e.target.value;
    if (g === '__all__') {
      renderGenreBar(stats);
      renderArtistBar(null, stats);
      renderDurationDistribution(stats, null);
      renderGenreRadar(stats, null);
    } else {
      renderArtistBar(g, stats);
      renderDurationDistribution(stats, g);
      renderGenreRadar(stats, g);
    }
  });
}

function renderDurationBins(stats) {
  const el = document.getElementById('duration_bins');
  el.innerHTML = '';
  if (!stats.duration_bins) return;
  Object.entries(stats.duration_bins).forEach(([k,v]) => {
    const span = document.createElement('span');
    span.style.marginRight = '10px';
    span.textContent = `${k}: ${v}`;
    el.appendChild(span);
  });
}

function renderDurationDistribution(stats, genre) {
  document.getElementById('durhist').innerHTML = '';
  // If a genre is selected use per-genre stats, else use global bins
  let bins = stats.duration_bins || {};
  let percentiles = stats.duration_percentiles || null;
  if (genre && stats.per_genre_duration_stats && stats.per_genre_duration_stats[genre]) {
    // approximate bins from per_genre_duration_stats if available
    const gstat = stats.per_genre_duration_stats[genre];
    percentiles = gstat ? gstat.percentiles : percentiles;
  }

  const data = Object.entries(bins).map(d=>({label:d[0],count:+d[1]}));
  const width = 700, height = 260, margin = {top:20,right:20,bottom:40,left:60};
  const svg = d3.select('#durhist').append('svg').attr('width', width).attr('height', height);

  if (!data.length && percentiles) {
    svg.append('text').attr('x', 20).attr('y', 30).text('No histogram bins available; showing percentiles:');
    const lines = [];
    for (let k of ['p25','p50','p75','p90']) {
      lines.push(`${k}: ${percentiles[k] ? Math.round(percentiles[k]) : 'N/A'}s`);
    }
    svg.append('text').attr('x', 20).attr('y', 60).text(lines.join(' | '));
    return;
  }

  const x = d3.scaleBand().domain(data.map(d=>d.label)).range([margin.left, width-margin.right]).padding(0.1);
  const y = d3.scaleLinear().domain([0, d3.max(data, d=>d.count)]).range([height-margin.bottom, margin.top]);

  svg.append('g').selectAll('rect').data(data).join('rect')
    .attr('x', d=>x(d.label))
    .attr('y', d=>y(d.count))
    .attr('width', x.bandwidth())
    .attr('height', d=>height-margin.bottom - y(d.count))
    .attr('fill', '#8da0cb');

  svg.append('g').attr('transform', `translate(0,${height-margin.bottom})`).call(d3.axisBottom(x));
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));

  if (percentiles) {
    const px = d3.scaleLinear().domain([0, d3.max(data, d=>d.count)]).range([margin.left, width-margin.right]);
    // place percentile legend
    const legend = svg.append('g').attr('transform', `translate(${width-220},${margin.top})`);
    legend.append('text').text(`p25: ${percentiles.p25 ? Math.round(percentiles.p25) : 'N/A'}s`).attr('y',0);
    legend.append('text').text(`p50: ${percentiles.p50 ? Math.round(percentiles.p50) : 'N/A'}s`).attr('y',14);
    legend.append('text').text(`p75: ${percentiles.p75 ? Math.round(percentiles.p75) : 'N/A'}s`).attr('y',28);
    legend.append('text').text(`p90: ${percentiles.p90 ? Math.round(percentiles.p90) : 'N/A'}s`).attr('y',42);
  }
}

function renderGenreBar(stats) {
  document.getElementById('barchart').innerHTML = '';
  const data = Object.entries(stats.genre_counts).sort((a,b)=>b[1]-a[1]).slice(0,20).map(d=>({genre:d[0],count:d[1]}));
  const width = 900, height = 400, margin = {top:20,right:20,bottom:100,left:140};

  const svg = d3.select('#barchart').append('svg').attr('width', width).attr('height', height);
  const x = d3.scaleLinear().domain([0, d3.max(data, d=>d.count)]).range([margin.left, width - margin.right]);
  const y = d3.scaleBand().domain(data.map(d=>d.genre)).range([margin.top, height - margin.bottom]).padding(0.1);

  svg.append('g').selectAll('rect').data(data).join('rect')
    .attr('x', margin.left)
    .attr('y', d=>y(d.genre))
    .attr('height', y.bandwidth())
    .attr('width', d=>x(d.count)-margin.left)
    .attr('fill', '#69b3a2')
    .on('click', (event, d) => {
      document.getElementById('genre_select').value = d.genre;
      renderArtistBar(d.genre, stats);
      renderDurationDistribution(stats, d.genre);
    })
    .append('title').text(d => `${d.genre}: ${d.count}`);

  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));

  const xAxis = d3.axisBottom(x).ticks(5).tickFormat(d3.format('~s'));
  svg.append('g').attr('transform', `translate(0,${height-margin.bottom})`).call(xAxis);
}

function renderArtistBar(genre, stats) {
  document.getElementById('artistchart').innerHTML = '';
  let data = [];
  if (!genre) {
    data = Object.entries(stats.artist_counts).slice(0,20).map(d=>({artist:d[0],count:d[1]}));
  } else {
    const list = stats.top_artists_per_genre && stats.top_artists_per_genre[genre] ? stats.top_artists_per_genre[genre] : [];
    data = list.map(d=>({artist:d[0],count:d[1]}));
  }
  if (!data.length) {
    document.getElementById('artistchart').textContent = 'No data for selected genre';
    return;
  }

  const width = 900, height = 320, margin = {top:20,right:20,bottom:100,left:220};
  const svg = d3.select('#artistchart').append('svg').attr('width', width).attr('height', height);
  const x = d3.scaleLinear().domain([0, d3.max(data, d=>d.count)]).range([margin.left, width - margin.right]);
  const y = d3.scaleBand().domain(data.map(d=>d.artist)).range([margin.top, height - margin.bottom]).padding(0.1);

  svg.append('g').selectAll('rect').data(data).join('rect')
    .attr('x', margin.left)
    .attr('y', d=>y(d.artist))
    .attr('height', y.bandwidth())
    .attr('width', d=>x(d.count)-margin.left)
    .attr('fill', '#ff7f0e')
    .append('title').text(d => `${d.artist}: ${d.count}`);

  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
  const xAxis = d3.axisBottom(x).ticks(5).tickFormat(d3.format('~s'));
  svg.append('g').attr('transform', `translate(0,${height-margin.bottom})`).call(xAxis);
}

function renderYearHistogram(stats) {
  const entries = Object.entries(stats.year_counts).map(d=>({year:+d[0],count:+d[1]})).sort((a,b)=>a.year-b.year);
  if (!entries.length) return;
  const width = 900, height = 200, margin = {top:20,right:20,bottom:40,left:40};
  const svg = d3.select('#yearhist').append('svg').attr('width', width).attr('height', height);
  const x = d3.scaleLinear().domain([entries[0].year, entries[entries.length-1].year]).range([margin.left, width-margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(entries, d=>d.count)]).range([height-margin.bottom, margin.top]);

  const area = d3.area().x(d=>x(d.year)).y0(height-margin.bottom).y1(d=>y(d.count)).curve(d3.curveStep);
  svg.append('path').datum(entries).attr('d', area).attr('fill', '#9ecae1');

  svg.append('g').attr('transform', `translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).tickFormat(d3.format('d')));
  svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
}

function renderAddedTimeline(stats) {
  const entries = Object.entries(stats.added_year_counts || {}).map(d=>({year:+d[0],count:+d[1]})).sort((a,b)=>a.year-b.year);
  if (!entries.length) return;
  const width = 900, height = 120, margin = {top:10,right:20,bottom:30,left:40};
  const svg = d3.select('#timeline').append('svg').attr('width', width).attr('height', height);
  const x = d3.scaleBand().domain(entries.map(d=>d.year)).range([margin.left, width-margin.right]).padding(0.1);
  const y = d3.scaleLinear().domain([0, d3.max(entries, d=>d.count)]).range([height-margin.bottom, margin.top]);

  svg.append('g').selectAll('rect').data(entries).join('rect')
    .attr('x', d=>x(d.year))
    .attr('y', d=>y(d.count))
    .attr('width', x.bandwidth())
    .attr('height', d=>height-margin.bottom - y(d.count))
    .attr('fill', '#66c2a5')
    .on('click', (event, d) => {
      // simple feedback: show chosen year in the summary
      const el = document.getElementById('summarytext');
      const txt = el ? el.textContent : '';
      const newtxt = `Selected added year: ${d.year}\n` + txt;
      if (el) el.textContent = newtxt;
    })
    .append('title').text(d => `${d.year}: ${d.count}`);

  svg.append('g').attr('transform', `translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).tickFormat(d3.format('d')));
}

(async function main(){
  const stats = await loadData();
  renderSummary(stats);
  populateGenreSelect(stats);
  renderDurationBins(stats);
  renderGenreBar(stats);
  renderArtistBar(null, stats);
  renderDurationDistribution(stats, null);
  renderYearHistogram(stats);
  renderAddedTimeline(stats);
  renderGenrePie(stats);
  renderGenreRadar(stats, null);
})();

function renderGenrePie(stats) {
  document.getElementById('genrepie').innerHTML = '';
  const data = Object.entries(stats.genre_counts).map(d=>({genre:d[0],count:d[1],pct:stats.genre_percentages[d[0]]})).sort((a,b)=>b.count-a.count).slice(0,30);
  const width = 360, height = 360, radius = Math.min(width, height)/2 - 10;
  const svg = d3.select('#genrepie').append('svg').attr('width', width).attr('height', height).append('g').attr('transform', `translate(${width/2},${height/2})`);

  const pie = d3.pie().value(d=>d.count).sort(null);
  const arc = d3.arc().innerRadius(0).outerRadius(radius);
  const labelArc = d3.arc().innerRadius(radius * 0.65).outerRadius(radius * 0.95);
  const color = d3.scaleOrdinal(d3.schemeCategory10);

  // Draw arcs with animation
  const arcs = svg.selectAll('g.slice').data(pie(data)).enter().append('g').attr('class','slice');
  const paths = arcs.append('path')
    .attr('class','pie-arc')
    .attr('fill', (d,i)=>color(i))
    .each(function(d){ this._current = {startAngle: 0, endAngle: 0}; })
    .on('click', (event, d)=>{
      document.getElementById('genre_select').value = d.data.genre;
      renderArtistBar(d.data.genre, stats);
      renderDurationDistribution(stats, d.data.genre);
      renderGenreRadar(stats, d.data.genre);
    })
    .append('title').text(d=>`${d.data.genre}: ${d.data.count}`);

  // animate the arcs
  paths.transition().duration(800).attrTween('d', function(d) {
    const interpolate = d3.interpolate(this._current, d);
    this._current = interpolate(1);
    return t => arc(interpolate(t));
  });

  // Labels for larger slices, fade-in
  arcs.append('text')
    .attr('class','pie-label')
    .attr('dy', '0.35em')
    .style('text-anchor', 'middle')
    .style('opacity', 0)
    .text(d=> (d.data.pct && d.data.pct > 0.02) ? `${d.data.genre}` : '')
    .attr('transform', d=> `translate(${labelArc.centroid(d)})`)
    .transition().delay(600).duration(300).style('opacity', 1);

  // optional polylines for labels (for medium slices)
  arcs.filter(d=>d.data.pct && d.data.pct > 0.045).append('polyline')
    .attr('points', d=> {
      const c = arc.centroid(d);
      const l = labelArc.centroid(d);
      return [c, l].map(pt => pt.join(',')).join(' ');
    })
    .attr('stroke', 'rgba(255,255,255,0.06)')
    .attr('fill', 'none')
    .style('opacity', 0)
    .transition().delay(700).duration(300).style('opacity', 1);

  // legend
  const legend = svg.append('g').attr('transform', `translate(${radius+10},${-radius})`);
  data.slice(0,10).forEach((d,i)=>{
    const g = legend.append('g').attr('transform', `translate(0,${i*16})`);
    g.append('rect').attr('width',12).attr('height',12).attr('fill',color(i));
    g.append('text').attr('x',16).attr('y',10).text(`${d.genre} (${d.count})`).attr('fill','var(--text)');
  });

  // subtle entrance animation for pie group
  svg.style('opacity',0).transition().duration(600).style('opacity',1);
}

function renderGenreRadar(stats, highlightGenre) {
  document.getElementById('genreradar').innerHTML = '';
  const top = stats.top_genres.slice(0,6);
  if (!top.length) return;
  const labels = top.map(d=>d[0]);
  // values are percentages 0..1
  const values = top.map(d=>stats.genre_percentages[d[0]] || 0);
  const width = 360, height = 360, radius = 140;
  const svg = d3.select('#genreradar').append('svg').attr('width', width).attr('height', height).append('g').attr('transform', `translate(${width/2},${height/2})`);

  const n = labels.length;
  const angleSlice = (Math.PI * 2) / n;
  const maxVal = Math.max(...values) || 1;
  const rScale = d3.scaleLinear().range([0, radius]).domain([0, maxVal]);

  // grid
  const levels = 4;
  for (let lvl=1; lvl<=levels; lvl++) {
    const r = radius * (lvl/levels);
    svg.append('circle').attr('r', r).attr('class','radar-grid').style('fill','none');
  }

  // axes
  const axes = svg.selectAll('.axis').data(labels).enter().append('g').attr('class','axis');
  axes.append('line').attr('x1',0).attr('y1',0).attr('x2', (d,i)=> rScale(maxVal) * Math.cos(angleSlice*i - Math.PI/2)).attr('y2',(d,i)=> rScale(maxVal) * Math.sin(angleSlice*i - Math.PI/2)).attr('class','radar-axis');
  axes.append('text').attr('class','radar-label').attr('x', (d,i)=> (rScale(maxVal) + 8) * Math.cos(angleSlice*i - Math.PI/2)).attr('y',(d,i)=> (rScale(maxVal) + 8) * Math.sin(angleSlice*i - Math.PI/2)).attr('text-anchor','middle').text(d=>d);

  // polygon points
  const points = values.map((v,i)=> {
    const r = rScale(v);
    return [r * Math.cos(angleSlice*i - Math.PI/2), r * Math.sin(angleSlice*i - Math.PI/2)];
  });

  const line = d3.line().curve(d3.curveLinearClosed);
  // start polygon at center and animate out
  const poly = svg.append('path').attr('d', line(points.map(()=>[0,0]))).attr('class','radar-polygon');
  poly.transition().duration(800).attrTween('d', function() {
    const interpolator = d3.interpolateArray(points.map(()=>[0,0]), points);
    return function(t) { return line(interpolator(t)); };
  });

  // hover tooltips
  svg.selectAll('.radar-point').data(points).enter().append('circle').attr('class','radar-point').attr('r',4)
    .attr('cx', d=>d[0]).attr('cy', d=>d[1]).attr('fill','var(--accent)')
    .on('mouseover', function(event, d) {
      const idx = points.indexOf(d);
      const label = labels[idx];
      const val = Math.round(values[idx]*10000)/100;
      const tip = d3.select('#genreradar').append('div').attr('class','tooltip').style('position','absolute').style('left','10px').style('top','10px').style('background','#0008').style('padding','6px').style('border-radius','4px').text(`${label}: ${val}%`);
      d3.select(this).attr('r',6);
    }).on('mouseout', function() { d3.selectAll('.tooltip').remove(); d3.select(this).attr('r',4); });

  // highlight selected genre by increasing its label opacity
  if (highlightGenre) {
    svg.selectAll('.radar-label').style('opacity', d=> d===highlightGenre ? 1 : 0.45).style('font-weight', d=> d===highlightGenre ? '700' : '400');
  }
}