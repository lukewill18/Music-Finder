import { Selector } from 'testcafe';

fixture `Testing page`
   .page `http://localhost:5500/#access_token=BQATN1Zf9j8x5BrKnDK8EEWrEnr0ByA6YS3JmzN3xn90vWnl0Me2myq3hl9kaDpCPHy3G1Z0Qf40R_hsRXjXd66rOxKlGW6maXTk4wxwObBYEiS4lbJ2U3m6DEoMNydfJ-Mg1DEYw7YHuUcgLSHVl_2mOnMpyP_0pzB-TuVL34b9YE1Au5f5&token_type=Bearer&expires_in=3600`;

async function checkStatsPage(t, genreHeader, artistHeader) {
    let h1 = Selector("#top-genres-header");
    let h2 = Selector("#top-artists-header");
    let tg = Selector("#top-genres");
    let ta = Selector("#top-artists");
    let tg_li = Selector(".top-genre");
    let ta_li = Selector(".top-artist");
    let ta_img = Selector(".top-artist-img");
    let ta_info = Selector(".top-artist-info");
    await t
        .expect(h1.exists).ok()
        .expect(h1.textContent).contains(genreHeader)
        .expect(h2.exists).ok()
        .expect(h2.textContent).contains(artistHeader)
        .expect(tg.exists).ok()
        .expect(ta.exists).ok()
        .expect(tg_li.count).eql(10)
        .expect(ta_li.count).eql(10)
        .expect(ta_img.count).eql(10)
        .expect(ta_info.count).eql(10)
}

async function test1() {
    test("Testing choosing a playlist with mouse actions", async t=> {
        let v0 = Selector("#visual0");
        let v1 = Selector("#visual1");
        await t
            .expect(v0.hasClass("playlist-visual-active")).ok()
            .click("#next-playlist")
            .expect(v1.hasClass("playlist-visual-active")).ok()
            .expect(v0.hasClass("playlist-visual-active")).notOk()
            .click("#prev-playlist")
            .expect(v0.hasClass("playlist-visual-active")).ok()
            .expect(v1.hasClass("playlist-visual-active")).notOk()
            .click(".playlist-img")

        checkStatsPage(t, "Your Playlist's Top Genres", "Your Playlist's Top Artists");
    });
}

async function test2() {
    test("Testing choosing a playlist with typing", async t => {
        let no_results = Selector(".no-results");
        let nr_msg = await no_results.find("#invalid-playlist-name");
        await t
            .typeText("#playlist-entry", "zzz")
            .expect(no_results.hasClass("playlist-visual-active")).ok()
            .expect(nr_msg.textContent).contains('zzz')
            .typeText("#playlist-entry", ":(", { replace: true })
        
        let active_p = Selector(".playlist-visual-active");
        let active_pname = await active_p.find(".playlist-name");
        await t
            .expect(active_pname.textContent).contains(":(")
            .click("#next-playlist")
            .expect(active_pname.textContent).contains(":()")
            .click("#next-playlist")
            .expect(active_pname.textContent).contains(":(")
            .typeText("#playlist-entry", "internship", { replace: true })
            .pressKey("enter")

            checkStatsPage(t, "Your Playlist's Top Genres", "Your Playlist's Top Artists");
    });
}

async function test3() {
    test("Testing choosing most-listened artists", async t => {
        let modal = Selector("#most-listened-modal");
        let stats = Selector("#stats-page");
        await t
            .click("#use-most-listened-btn")
            .expect(modal.hasClass("hidden")).notOk()
            .typeText("#num-artists", "51", {replace: true})
            .pressKey("enter")
            .expect(stats.hasClass("hidden")).ok()
            .typeText("#num-artists", "0", {replace: true})
            .pressKey("enter")
            .expect(stats.hasClass("hidden")).ok()
            .typeText("#num-artists", "10", {replace: true})
            .click("#submit-settings-btn")
        checkStatsPage(t, "Your Most-Listened Artists' Genres", "Your Most-Listened Artists");
    });
}

async function test4() {
    test("Testing recommendation page", async t => {
        let ar = Selector("#artist-recs");
        let rec = Selector(".artist-rec");
        let name1 = Selector(".rec-name");
        let art = Selector("#art0");
        await t
            .click(".playlist-img")
            .click("#recommendation-btn")
            .expect(ar.exists).ok()
            .expect(rec.count).eql(31)
            .expect(art.hasClass("hidden")).ok()
            .click(name1)
        let modal_info = Selector("#info0");
        let modalcontainer = Selector("#rec-modal-container");
        let genres = await modal_info.find(".rec-genre-list");
        let preview = await modal_info.find(".preview-clip");
        let img = await modal_info.find(".artist-img");
        let st = await modal_info.find(".similar-to");
        let finishPage = Selector("#finish-page");
        await t
            .expect(art.exists).ok()
            .expect(genres.exists).ok()
            .expect(preview.exists).ok()
            .expect(img.exists).ok()
            .expect(st.exists).ok()
            .expect(modal_info.hasClass("hidden")).notOk()
            .click(modalcontainer)
            .expect(modal_info.hasClass("hidden")).ok()
            .hover(name1)
            .expect(art.hasClass("hidden")).notOk()
            .click("#generate-playlist-btn")
            .expect(finishPage.hasClass("hidden")).notOk()     
    });
}

test1();
test2();
test3();
test4();