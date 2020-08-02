let totalTracks;
const url_re = new RegExp("^.*#access_token=(.*?)&token_type=.*$");
let showing_most_listened_modal = false;
let stats_headers_changed = false;
let using_most_listened = false;
let most_listened = [];
let playlists_loaded = false;
let showing_rec_modal = false;
let recOffset = 0;
let recs_background_loaded = false;
let visited_recs_page = false;
let playlists;
let playlist;
let visuals;
let current_visual = 0;
let moving_visual = false;
let user;
let token;
let artistPrevalence;
let genrePrevalence = {};
let genreOrder;
let stats_loaded = false;
let stats_loading = false;
let recs_loaded = false;
let first_recs_loading = false;
let recs_loading = false;
let recs_cancelled = false;
let tracks = [];
let artistRecs = {};
let current_rec_info;
let current_art;
let shuffle;
let showing_alert = false;
let playlists_generated = 0;
let generating_playlist = false;

$(document).ready(function() {
    const body = $("body");
    const backgroundVideo = $("#background-video");
    const playlistPage = $("#playlist-entry-page");
    const mostListenedModalContainer = playlistPage.find("#most-listened-modal-container");
    const mostListenedModal = playlistPage.find("#most-listened-modal");
    const mostListenedForm = mostListenedModal.find("#most-listened-settings");
    const closeMostListenedModalBtn = mostListenedModal.find("#most-listened-modal-close");
    const nextPlaylist = playlistPage.find("#next-playlist");
    const prevPlaylist = playlistPage.find("#prev-playlist");
    const playlistImageBox = playlistPage.find("#playlist-select-box");
    const noResultsVisual = playlistImageBox.find(".no-results");
    const input = playlistPage.find("#playlist-entry");
    const alert = $("#alert");
    const statsPage = $("#stats-page");
    const statsBackground = statsPage.find("#stats-background");
    const recPage = $("#recommendation-page");
    const recsBackground = recPage.find("#recs-background");
    const finishPage = $("#finish-page");
    const topArtistsHeader = statsPage.find("#top-artists-header");
    const topGenresHeader = statsPage.find("#top-genres-header");
    const topArtists = statsPage.find("#top-artists");
    const topGenres = statsPage.find("#top-genres");
    const artistRecList = recPage.find("#artist-recs");
    const recModalContainer = recPage.find("#rec-modal-container");
    const artBox = recPage.find("#album-art-frame");
    const recModal = recModalContainer.find("#rec-modal");
    const closeRecModalBtn = recModal.find("#rec-modal-close");

    function filter_visuals(valid_playlists, search_phrase) {
        let toShow = [];
        for(let i = 0; i < valid_playlists.length; ++i) {
            toShow.push(playlistImageBox.find(valid_playlists[i])[0]);
        }
        $(visuals[current_visual]).removeClass("playlist-visual-active");
        $(visuals[current_visual]).addClass("hidden");
        visuals = toShow;
        if(toShow.length > 0) {
            noResultsVisual.addClass("hidden");
            noResultsVisual.removeClass("playlist-visual-active");
            $(toShow[0]).addClass("playlist-visual-active");
            $(toShow[0]).removeClass("hidden");
            $(toShow[0]).css("left", 0);
            current_visual = 0;
        }
        else {
            current_visual = -1;
            noResultsVisual.removeClass("hidden");
            noResultsVisual.addClass("playlist-visual-active");
            noResultsVisual.children("#invalid-playlist-name").text(search_phrase);
        }
    }
    
    function addPlaylistVisuals() {
        playlistImageBox.find(".playlist-visual").remove(); // remove all pre-existing playlists 
        let temp = ``   ;
        for(let i = 0; i < playlists.length; ++i) {
            temp += `<div class="playlist-visual" id="visual${i}">
                        <img class="playlist-img" src="${playlists[i].images[0].url}">
                        <p class="playlist-name">${playlists[i].name}</p>
                    </div>`;
        }
        playlistImageBox.find(".loader").addClass("hidden");
        playlistImageBox.append(temp);
    }

    nextPlaylist.click(function() {
        moveVisual(1);
    });
    prevPlaylist.click(function() {
        moveVisual(-1);
    });

    function moveVisual(direction) {
        if(visuals == undefined || moving_visual || visuals.length < 2) return;
        moving_visual = true;

        let next_visual = (current_visual + direction) % visuals.length;
        if(next_visual < 0)
            next_visual = visuals.length - 1;

        let box_width = playlistImageBox.css("width");
        if(direction == -1)
            $(visuals[next_visual]).css("left", "-" + box_width);
        else
            $(visuals[next_visual]).css("left", box_width)

        let new_left = direction == 1 ? "-=" + box_width : "+=" + box_width;

        $(visuals[next_visual]).removeClass("hidden");
        anime({
            targets: [visuals[current_visual], visuals[next_visual]],
            left: {
                value: new_left,
                duration: 400,
                easing: "linear"    
            },
            complete: function(e) {
                moving_visual = false;
                current_visual = next_visual;
                $(e.animatables[0].target).removeClass("playlist-visual-active");
                $(e.animatables[0].target).addClass("hidden");
                $(e.animatables[1].target).addClass("playlist-visual-active");
            }
        });
    }

    function handlePlaylistSelection() {
        if(playlists.length == 0) {
            current_visual = -1;
            noResultsVisual.removeClass("hidden");
            noResultsVisual.addClass("playlist-visual-active");
            noResultsVisual.children("#no-results-msg").text("No playlists found. Please ensure that the playlists you want to use are public.");
            noResultsVisual.children("#invalid-playlist-name").remove();
            noResultsVisual.children("#quote").remove();
            playlistImageBox.removeClass("glow");
        }
        addPlaylistVisuals();
        visuals = playlistImageBox.find(".playlist-visual");
        $(visuals[current_visual]).addClass("playlist-visual-active");
        playlists_loaded = true;
    }

    function choose_playlist(active_visuals) {
        let id = active_visuals[0].id;
        let new_playlist = playlists[parseInt(id.slice(id.length - 1))];
        if(playlist == undefined || playlist.id != new_playlist.id || using_most_listened) {
            stats_loaded = false;
            recs_loaded = false;
            visited_recs_page = false;
        }
        using_most_listened = false;
        playlist = new_playlist;
        user = playlist.owner.id;
        totalTracks = playlist.tracks.total;
        handleStatistics(user, playlist.id);
    }

    playlistImageBox.click(function() {
        if(moving_visual) return;
        let active = $(this).find(".playlist-visual-active");
        if(active.length == 0) return;
        choose_playlist(active);
    });

    playlistImageBox.mouseenter(function() {
        if(current_visual > -1) {
            $(this).addClass("glow");
        }
    });
    playlistImageBox.mouseleave(function() {
        if(current_visual > -1) {
            $(this).removeClass("glow");
        }
    });

    function useMostListened(num_artists, time_range, token) {
        using_most_listened = true;
        stats_loaded = false;
        recs_loaded = false;
        visited_recs_page = false;
        let promises = [];
        promises.push(getMostListenedUserID(token, alert));
        promises.push(getMostListenedArtists(num_artists, time_range, token, alert));
        Promise.all(promises).then(function(resolves) {
            user = resolves[0];
            most_listened = resolves[1];
            window.location.hash = "#statistics";
        });            
    }

    mostListenedForm.on("submit", function(e) {
        e.preventDefault();
        let checked = $(this).find("input:checked");
        if(checked.length == 0) {
            showAlert(alert, "Please select a Time Range");
            return;
        }
        let num_artists = $(this).find("#num-artists").val();
        if(num_artists == "" || num_artists < 1 || num_artists > 50) {
            showAlert(alert, "Please enter a valid number of artists (between 1 and 50)")
            return;
        }
        hideMostListenedModal();
        useMostListened(num_artists, checked[0], token);

    });
    
    function hideMostListenedModal() {
        mostListenedModalContainer.css("display", "none");
        body.removeClass("stop-scroll");
        mostListenedModal.css("opacity", "0");
        showing_most_listened_modal = false;
    }

    playlistPage.click(function(event) {
        if($(event.target).is(mostListenedModalContainer)) {
            hideMostListenedModal();
        }
    });

    closeMostListenedModalBtn.click(hideMostListenedModal);

    playlistPage.find("#use-most-listened-btn").click(function() {
        mostListenedModalContainer.css("display", "block");
        body.addClass("stop-scroll");
        modalAnimation.restart();
        backgroundAnimation.restart();
        showing_most_listened_modal = true;
    });

    let url_check = window.location.href.match(url_re);
    if(url_check != null) {
        console.log(window.location.href);
        window.location.hash = "#playlist-select";
    }
    else {
        window.location.hash = "";
    }

    $("#login-btn").click(function() {
        window.location.href = "https://accounts.spotify.com/authorize?client_id=73df06c4d237418197bc43d50f729c0f&response_type=token&scope=playlist-modify-public user-top-read&redirect_uri=https://lukewill18.github.io/Music-Finder/&show_dialog=true";
        //window.location.href = "https://accounts.spotify.com/authorize?client_id=73df06c4d237418197bc43d50f729c0f&response_type=token&scope=playlist-modify-public user-top-read&redirect_uri=http://localhost:5500/&show_dialog=true";
    });

    function clearStats() {
        topArtists.find(".top-artist-col").remove();
        topGenres.find(".text-background").remove();
        statsBackground.find(".stats-background-box").remove();
        topArtists.find(".loading").removeClass("hidden");
        topGenres.find(".loading").removeClass("hidden");
        tracks = [];
        artistPrevalence = {};
        genrePrevalence = {};
    }

    function insertTopArtists(num_tracks) {
        let template = ``;
        let artistOrder = Object.keys(artistPrevalence).sort(function(a, b) {
            return artistPrevalence[b].count - artistPrevalence[a].count;
        });

        let top10Artists = artistOrder.map(name => artistPrevalence[name]["artist_id"]).slice(0, 10);
        let imagePromises = [];
        for(let i = 0; i < 10; ++i) {
            imagePromises.push(getArtistImage(top10Artists[i], token));
        }
        
        Promise.all(imagePromises).then(function(images) {
            for(let i = 0; i < artistOrder.length && i < 10; ++i) {
                template += `
                            <div class="top-artist-col">
                                <div class="text-background">
                                    <li class="top-artist">
                                        <div class="top-artist-img-container">
                                            <img class="top-artist-img" src="${images[i]}">
                                        </div>
                                        <p class="top-artist-info">
                                            ${artistPrevalence[artistOrder[i]].display_name}`
                            if(!using_most_listened)
                                template += `<br>(${(artistPrevalence[artistOrder[i]].count/num_tracks * 100).toFixed(2)}%)`;
                            
                            template += `</p>
                                    </li>
                                </div>
                            </div>`;
            }
            topArtists.find(".loading").addClass("hidden");
            topArtists.find(".row").append(template);
        });
    }

    function insertTopGenres(num_tracks) {
        let template = ``;
        genreOrder = Object.keys(genrePrevalence).sort(function(a, b) {
            return genrePrevalence[b] - genrePrevalence[a];
        });
        for(let i = 0; i < genreOrder.length && i < 10; ++i) {
            template += `<div class="text-background"><li class="top-genre">${genreOrder[i]} (${(genrePrevalence[genreOrder[i]]/num_tracks * 100).toFixed(2)}%)</li></div>`;
        }
        topGenres.find(".loading").addClass("hidden");
        topGenres.append(template);
    }

    function setStatsPageBackground(all_images) {
        shuffle_array(all_images);
        let images = new Set(all_images);
        let i = 0;
        let temp = ``;
        let max = all_images.length >= 300 ? 300 : 200;
        let fb = all_images.length >= 300 ? "8%" : "10%";
        while(i < max) {
            for(let image of images) {           
                if(i >= max) break;
                temp += `<div class="stats-background-box" id="box${i}" style="flex-basis: ${fb}">
                            <img class="stats-background-img" src=${image}>
                        </div>`
                ++i;
            }
        }
        statsBackground.append(temp);

        for(let i = 0; i <= max; ++i) {
            setTimeout(function() {
                anime({
                    targets: '#box' + i.toString(),
                    opacity: 1,
                    easing: "linear",
                    duration: 300
                });
            }, Math.floor(Math.random() * 10000) % 1000);  
        }
    }

    function handleStatistics(user, playlist) {
        window.location.hash = "#statistics";
    }

    function clearRecs() {
        if(showing_rec_modal) hideRecModal();
        artistRecList.find(".artist-rec:not(#check-all-row)").remove();
        recModal.find(".rec-info-box").remove();
        recsBackground.find(".recs-background-box").remove();
        artistRecList.find("#check-all-row").addClass("hidden");
        artistRecList.find(".loading").removeClass("hidden");
        artistRecList.find(".new-loader").remove();
        artBox.find("*").remove();
        recOffset = 0;
        artistRecs = {};
        recs_background_loaded = false;
    }

    function setRecsBackground(recOrder, num_recs) {
        let images = [];
        let total_length = 0;
        for(let i = 0; i < num_recs; ++i) {
            total_length += artistRecs[recOrder[i]].album_art.length;
        }
        let j = 0;
        while(images.length < 200 && images.length < total_length) {
            for(let i = 0; i < num_recs; ++i) {
                let art = artistRecs[recOrder[i]].album_art[j];
                if(art != undefined)
                    images.push(art);
                if(images.length >= 200) break;
            }
            ++j;
        }
        shuffle_array(images);
        let temp = ``;
        for(let i = 0; i < images.length; ++i) {
            temp += `<div class="recs-background-box" id="recsbox${i}"><img src="${images[i]}" class="recs-background-img"></div>`;
        }
        recsBackground.append(temp);
        for(let i = 0; i < images.length; ++i) {
            setTimeout(function() {
                anime({
                    targets: '#recsbox' + i.toString(),
                    opacity: 1,
                    easing: "linear",
                    duration: 300
                });
            }, Math.floor(Math.random() * 10000) % 3000);  
        }
        recs_background_loaded = true;
    }

    function generateArtistModalTemplate(artistRecs, recOrder, i, sortedSimilar) {  
        let template = `<div class="rec-info-box hidden" id="info${i}">
                            <h2>${recOrder[i]}</h2>
                            <div class="row">
                                <div class="col-5 col-sm-3 artist-img-col">
                                    <img class="artist-img" src="${artistRecs[recOrder[i]].image}">
                                </div>
                                <div class="col-7 col-sm-9 left-align">
                                    <div class="rec-genre-list-container">`;
                                    if(artistRecs[recOrder[i]].genres.length > 0) {
                                        template += `<p class="rec-genre-list">Genres: ${artistRecs[recOrder[i]].genres.join(", ")}</p>`;
                                    }
                                    else {
                                        template += `(No genres available)`
                                    }
                                    template += `
                                    </div>
                                    <div class="song-preview-container">`;
                        if(artistRecs[recOrder[i]].top_track != null) {
                            let track = artistRecs[recOrder[i]].top_track;
                            template += `<audio controls class="preview-clip" preload="none" src="${track.preview_url}"></audio>`
                            template += `<div class="preview-clip-info"><p class="preview-clip-info-text"><span class="songname"><i class="fas fa-music"></i>&ensp;${track.name}</span><span class="albumname"><i class="fas fa-compact-disc"></i>&ensp;${track.album.name}</span></p></div>`;
                        }
                        else {
                            template += `(No song preview available)`
                        }
                        template += `
                                    </div>
                                </div>
                            </div>
                            <div class="similar-to-box"><p class="similar-to">Similar to: `;
        for(let j = 0; j < sortedSimilar.length; ++j) {
            let sim = sortedSimilar[j].similarity;
            let simClass = determineSimilarity(sim);      
            template += `<span class="${simClass}">${sortedSimilar[j].name}</span>, `
        }
        template = template.slice(0, -2);
        template += `</p></div></div>`;
        return template;
    }

    function generateSideArtTemplate(artistRecs, recOrder, i) {
        let template = `<div id="art${i}" class="hidden">`;
        artistRecs[recOrder[i]].art_id = "art" + i.toString();
        let art = artistRecs[recOrder[i]].album_art;
        for(let j = 0; j < art.length; ++j) {
            template += `<img class="album-art" src="${art[j]}" draggable="false">`
        }
        template += `</div>`
        return template;
    }

    function generateLiTemplate(pre_checked, recOrder, i) {
        template = `<li class="artist-rec centered"><input type="checkbox" class="rec-checkbox"`
        if(pre_checked) {
            template += ` checked`
        }
        template += `><p class="rec-name">${recOrder[i]}</p></li>`;
        return template;
    }

    function determinePreCheck() {
        let pre_checked;
        let check_all = recPage.find("#check-all");
        if(check_all.length < 1)
            pre_checked = false;
        else   
            pre_checked = check_all[0].checked;
        return pre_checked;
    }

    function generateRecTemplates(recOrder, num_recs, artistRecs, pre_checked) {
        let li_template = ``;
        let modal_template = ``;
        let side_art_template = ``;
        for(let i = recOffset; i < recOrder.length && i < num_recs + recOffset; ++i) {
            let sortedSimilar = artistRecs[recOrder[i]].similarTo.sort(function(a, b) {
                return b.similarity - a.similarity;
            });
            artistRecs[recOrder[i]].info_id = "info" + i.toString();
            li_template += generateLiTemplate(pre_checked, recOrder, i);
            modal_template += generateArtistModalTemplate(artistRecs, recOrder, i, sortedSimilar);
            side_art_template += generateSideArtTemplate(artistRecs, recOrder, i);
        }
        return {li_template: li_template, modal_template: modal_template, side_art_template: side_art_template};
    }

    function appendRecTemplates(li_template, modal_template, side_art_template) {
        artistRecList.find(".loading").addClass("hidden");
        artistRecList.find("#check-all-row").removeClass("hidden");
        artistRecList.append(li_template);
        recModal.append(modal_template);
        artBox.append(side_art_template);
    }

    function makeAudioQuieter() {
        let audio_clips = recModal.find(".preview-clip");
        for(let i = 0; i < audio_clips.length; ++i) {
            audio_clips[i].volume = .25;
        }
    }

    function insertArtistRecs(artistRecs, token, num_recs) {
        let promises = [];
        let recOrder = Object.keys(artistRecs).sort(function(a, b) {
            return artistRecs[b].match - artistRecs[a].match;
        });
        
        for(let i = recOffset; i < recOrder.length && i < num_recs + recOffset; ++i) {
            promises.push(getAdditionalArtistInfo(recOrder[i], token, artistRecs, alert));
        }
        return new Promise(function(resolve, reject) {
            let all = Promise.all(promises);
            all.catch(function(msg) {
                reject(msg);
            });
            all.then(function() {
                if(!recs_background_loaded) 
                    setRecsBackground(recOrder, num_recs);
                let pre_checked = determinePreCheck();
                
                let templates = generateRecTemplates(recOrder, num_recs, artistRecs, pre_checked);
                appendRecTemplates(templates.li_template, templates.modal_template, templates.side_art_template);
                makeAudioQuieter();
                recOffset += num_recs;
                resolve();
            });        
        });
    }
    
    function handleRecommendations() {
        first_recs_loading = true;
        let artistRecPromise = collectArtistRecs(artistPrevalence, token, artistRecs, alert);
        artistRecPromise.then(function() {
            first_recs_loading = false;
            let insertPromise = insertArtistRecs(artistRecs, token, 30);
            insertPromise.catch(function(msg) {
                showAlert(alert, "Could not load recommendations, please refresh the page and try again");
            });
            insertPromise.then(function() {
                recs_loaded = true;
                
            });
        });
        artistRecPromise.catch(function(e) {
        });
    }

    input.keyup(function(e) {
        if(e.keyCode == 13) {
            if(current_visual != -1) {
                choose_playlist(playlistImageBox.find(".playlist-visual-active"));
            }
        }
        let str = $(this).val();
        let valid_playlists = [];
        for(let i = 0; i < playlists.length; ++i) {
            if(playlists[i].name.toLowerCase().includes(str.toLowerCase())) {
                valid_playlists.push("#visual" + i.toString());
            }
        }
        filter_visuals(valid_playlists, str);
    });
    statsPage.find("#recommendation-btn").click(function() {
        if(!stats_loaded) return;
        window.location.hash = "#recommendations";
        /*switchPage(statsPage, recPage, "#recommendations");
        handleRecommendations();*/
       });


    function hideRecModal() {
        showing_rec_modal = false;
        recModalContainer.css("display", "none");
     //   body.toggleClass("stop-scroll");
        recModal.css("opacity", "0");
        artistRecList.find(".artist-rec").removeClass("push-back");
        artistRecList.find(".shadow").removeClass("shadow");
        let current_preview = current_rec_info.find(".preview-clip")[0];
        if(current_preview != undefined) {
            current_preview.pause();
            current_preview.currentTime = 0;
        }
        current_rec_info.toggleClass("hidden");
        
    }
    
    closeRecModalBtn.click(hideRecModal);

    recPage.click(function(event) {
        if($(event.target).is(recModalContainer)) {
            hideRecModal();
        }
    });

    let modalAnimation = anime({
        targets: '.modal',
        opacity: 1,
        top: "50px",
        easing: "linear",
        duration: 350
    });

    let backgroundAnimation = anime({
        targets: '.modal-container',
        backgroundColor: "rgba(0, 0, 0, .4)",
        duration: 250
    });

    recPage.on("click", ".rec-name", function() {
        let name = $(this).text();
        if(!artistRecs.hasOwnProperty(name)) return;
        
        artistRecList.find(".artist-rec").addClass("push-back");
        $(this).parent().addClass("shadow").removeClass("push-back");
        current_rec_info = recPage.find("#" + artistRecs[name].info_id);
        current_rec_info.toggleClass("hidden");
        recModalContainer.css("display", "block");
        showing_rec_modal = true;
     //   body.toggleClass("stop-scroll");
        
        modalAnimation.restart();
        backgroundAnimation.restart();
    });

    recPage.on("click", ".artist-rec", function(e) {
        if(e.target == this) {
            let checkbox = $(this).children("input")[0];
            if(checkbox != undefined) {
                $(checkbox).prop("checked", !checkbox.checked);
                if(checkbox.id == "check-all") 
                    recPage.find(".rec-checkbox").prop("checked", checkbox.checked);
            }
        }
    });

    function shuffle_art(album_art) {
        let current = 0;
        $(album_art[current]).css("opacity", "1");
        shuffle = setInterval(function() {
            $(album_art[current]).css("opacity", "0");
            current = (current + 1) % album_art.length;
            $(album_art[current]).css("opacity", "1");
        }, 3000);
    }

    recPage.on("mouseenter", ".artist-rec", function() {        
        if($(this).id == "check-all-row") return;
        let name = $(this).find(".rec-name").text();
        if(!artistRecs.hasOwnProperty(name)) return;

        if(current_art == undefined) {
            current_art = recPage.find("#" + artistRecs[name].art_id);
            $(current_art).toggleClass("hidden");
            shuffle_art($(current_art).find(".album-art"));
        }
        else 
        {
            let new_art = recPage.find("#" + artistRecs[name].art_id);
            if(new_art[0].id == current_art[0].id) 
                return;
            $(current_art).addClass("hidden");
            $(current_art).find(".album-art").css("opacity", "0");
            clearInterval(shuffle);
            current_art = new_art;
            $(current_art).removeClass("hidden");
            shuffle_art($(current_art).find(".album-art"));
        }
    });

    function generatePlaylistName(playlists) {
        let playlistName = "Music Finder Recommendations 1";
        let playlistNames = playlists.map(function(i) {
            return i.name;
        });
        let index = 2;
        while(playlistNames.indexOf(playlistName) > -1) {
            playlistName = playlistName.slice(0, -1);
            playlistName += index.toString(); 
            ++index;
        }
        if(playlists_generated > 0) {
            index += playlists_generated - 1;
            playlistName = playlistName.slice(0, -1);
            playlistName += index.toString();
        }
        return playlistName;
    }


    recPage.on("click", "#check-all", function() {
        recPage.find(".rec-checkbox").prop("checked", this.checked);
    });

    recPage.find("#generate-playlist-btn").click(function() {
        if(!recs_loaded || generating_playlist) return;
        let checked = recPage.find(".rec-checkbox:checkbox:checked");
        if(checked.length == 0) {
            showAlert(alert, "No artists selected. Please check boxes of the artists that you want to add to the playlist.");
            return;
        }
        let artistsToAdd = [];
        generating_playlist = true;
        for(let i = 0; i < checked.length; ++i) {
            let name = $(checked[i]).siblings(".rec-name").text();
            if(artistRecs.hasOwnProperty(name)) {
                artistsToAdd.push(name);
            }
        }
        let playlistName = generatePlaylistName(playlists);
        let urlPromise = generatePlaylist(artistsToAdd, user, token, playlistName, artistRecs, alert);
        urlPromise.then(function(url) {
            playlistURL = url;
            switchPage(recPage, $("#finish-page"), "#finish");
            backgroundVideo.removeClass("hidden");
            ++playlists_generated;
            generating_playlist = false;
        });
    });


    finishPage.find("#playlist-link-btn").click(function() {
        if(playlistURL == undefined) return;
        window.open(playlistURL);
    });

    finishPage.find("#go-again-btn").click(function() {
        window.location.href = "#playlist-select";
        collectAndDisplayPlaylists();
    });

    function load_more_recs() {
        recs_loading = true;
        artistRecList.append(`<li class="new-loader"><div class="loader"></li>`);
        let insertPromise = insertArtistRecs(artistRecs, token, 20);
        insertPromise.catch(function(msg) {
            showAlert(alert, "Could not load recommendations, please wait a few seconds");
          //  artistRecList.find(".new-loader").remove();
          //  setTimeout(load_more_recs, 3000);
        });
        insertPromise.then(function() {
            artistRecList.find(".new-loader").remove();
            recs_loading = false;
        });
    }

    artistRecList.scroll(function(e) {
        if(recs_loading || showing_alert) return;
        if(recs_loaded) {
            let scroll_dist = $(this).scrollTop() + $(this).innerHeight();
            if(scroll_dist + 100 > this.scrollHeight) {
                load_more_recs();
            }
        }
    });

    body.keydown(function(e) {
        if(e.keyCode == 32 && showing_rec_modal && window.location.hash == "#recommendations") {
            e.preventDefault();
            let current_preview = $(current_rec_info).find(".preview-clip")[0];
            if(current_preview != undefined) {
                if(current_preview.paused) 
                    current_preview.play();
                else   
                    current_preview.pause();
            }
            
        }
    });

    function collectAndDisplayPlaylists() {
        playlists_generated = 0;
        playlistImageBox.find(".loader").removeClass("hidden");
        let playlistPromise = collectAllPlaylists(token, alert);        
        playlistPromise.then(function(result) {
            playlists = result.filter(function(p) {
                return !p.name.includes("<script") && !p.name.includes("/script>") && p.tracks.total > 0;
            });
            handlePlaylistSelection();
        });
    }

    playlistPage.find("#refresh-playlists").click(function() {
        if(!playlists_loaded) return;
        playlists_loaded = false;
        collectAndDisplayPlaylists();
    });
    
    function switchToPlaylistPage(current) {
        switchPage(current, playlistPage, "#playlist-select");

        backgroundVideo.removeClass("hidden");
        token = url_check[1];
        input.val("");
        input.focus();
        if(!playlists_loaded) {
            collectAndDisplayPlaylists();
        }
        else {
            let valid_playlists = [];
            for(let i = 0; i < playlists.length; ++i) {
                valid_playlists.push("#visual" + i.toString());
            }
            filter_visuals(valid_playlists, "");
        }
    }

    function getAllTrackImages(tracks) {
        let img_index;
        if(tracks.length >= 100) {
            img_index = 1;
        }
        else {
            img_index = 0;
        }
        let all_images = tracks.filter(function(t) {
            return t.images[img_index] != undefined && Math.abs(t.images[img_index].height - t.images[img_index].width) < 100;
        }).map(function(t) {
            return t.images[img_index].url;
        });
        return all_images;
    }

    function loadPlaylistStats() {
        if(stats_headers_changed) {
            topArtistsHeader.text("Your Playlist's Top Artists");
            topGenresHeader.text("Your Playlist's Top Genres");
            stats_headers_changed = false;
        }
        let trackPromise = collectAllTracks(user, playlist.id, token, tracks, alert);
        trackPromise.then(function(track_blocks) {
            for(let i = 0; i < track_blocks.length; ++i) {
                tracks = tracks.concat(track_blocks[i]);
            }
            let all_images = getAllTrackImages(tracks);
            
            setStatsPageBackground(all_images);
            artistPrevalence = getArtistPrevalence(tracks);
            insertTopArtists(tracks.length);
            let genrePromise = getGenrePrevalence(artistPrevalence, token, genrePrevalence, alert);
            genrePromise.then(function() {
                insertTopGenres(tracks.length);
                stats_loaded = true;
                stats_loading = false;
                if(!recs_loaded) {
                    clearRecs();
                    handleRecommendations();
                }
            }); 
        }).catch(function(thrown) {
        });
    }

    function loadMostListenedStats() {
        if(!stats_headers_changed) {
            topArtistsHeader.text("Your Most-Listened Artists");
            topGenresHeader.text("Your Most-Listened Artists' Genres");
            stats_headers_changed = true;
        }
        artistPrevalence = getMostListenedArtistPrevalence(most_listened);
        let artists = Object.keys(artistPrevalence);
        let art_promises = [];
        let all_images = [];
        for(let i = 0; i < artists.length; ++i) {
            art_promises.push(setAlbumArt(artistPrevalence[artists[i]].artist_id, token, artistPrevalence, artists[i], alert));
        }
        Promise.all(art_promises).then(function() {
            for(let i = 0; i < artists.length; ++i) {
                all_images = all_images.concat(artistPrevalence[artists[i]].album_art);
            }
            setStatsPageBackground(all_images);
        });

        insertTopArtists(most_listened.length);
        let genrePromise = getGenrePrevalence(artistPrevalence, token, genrePrevalence, alert);
            genrePromise.then(function() {
                insertTopGenres(most_listened.length);
                stats_loaded = true;
                if(!recs_loaded) {
                    clearRecs();
                    handleRecommendations();
                }
        }); 
    }

    function switchToStatsPage(current) 
    {
        if(showing_most_listened_modal) {
            hideMostListenedModal();
        }
        if(current_rec_info != undefined) {
            let current_preview = current_rec_info.find(".preview-clip")[0];
            if(current_preview != undefined) {
                current_preview.pause();
            }
        }        
        switchPage(current, statsPage, "#statistics");
     //   body.removeClass("stop-scroll");
        backgroundVideo.addClass("hidden");
        if(!stats_loaded) {
            clearStats();
            stats_loading = true;
            recs_cancelled = false;
            if(!using_most_listened) {
                loadPlaylistStats();
            }
            else {
                loadMostListenedStats();
            }
        }
        else if (recs_cancelled && !recs_loaded) {
            clearRecs();
            handleRecommendations();
        }
    }

    function switchToRecsPage(current) 
    {
        switchPage(current, recPage, "#recommendations");
        if(!visited_recs_page)
            artistRecList.scrollTop(0);

        visited_recs_page = true;
        /* if(!recs_loaded) {
            clearRecs();
            handleRecommendations();
        } */
    }

    $(window).on("hashchange", function() {
        let hash = window.location.hash;
        let current = body.find(".shown");
        if(hash == "#playlist-select") {
            switchToPlaylistPage(current);
            if(first_recs_loading) {
                source.cancel();
                CancelToken = axios.CancelToken;
                source = CancelToken.source();
                recs_cancelled = true;
            }
            if(stats_loading) {
                cancelTrackRequest();
            }
        }
        else if(hash == "#statistics") {
            switchToStatsPage(current);
        }
        else if(hash == "#recommendations") {
            switchToRecsPage(current);
        }
    });
});