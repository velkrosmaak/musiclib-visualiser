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
    } else {
      renderArtistBar(g, stats);
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

(async function main(){
  const stats = await loadData();
  renderSummary(stats);
  populateGenreSelect(stats);
  renderDurationBins(stats);
  renderGenreBar(stats);
  renderArtistBar(null, stats);
  renderYearHistogram(stats);
})();