// data.js — short plain-language notes for /luach (written for this page).
//
// HOLIDAY_NOTES is keyed by @hebcal/core Event#basename(). CHABAD_DAYS are
// Chabad dates by Hebrew date (month numbers as in logic.js: 1 Nissan ... 7 Tishrei).

export const HOLIDAY_NOTES = {
  'Rosh Hashana': 'The Jewish New Year and the day of judgment, when Hashem is crowned King. We hear the shofar and pray for a good and sweet year.',
  'Tzom Gedaliah': 'A dawn-to-nightfall fast for Gedaliah ben Achikam, whose murder ended Jewish self-rule after the first Temple’s destruction.',
  'Shabbat Shuva': 'The Shabbos between Rosh Hashanah and Yom Kippur, named for the haftarah “Shuvah Yisrael” — return, Israel.',
  'Yom Kippur': 'The Day of Atonement: a 25-hour fast of prayer and teshuvah that ends with Ne’ilah and the shofar.',
  'Sukkot': 'Seven days of eating in the sukkah and taking the four kinds (lulav, esrog, hadassim, aravos), “the season of our rejoicing”.',
  'Shmini Atzeret': 'The holiday that follows Sukkos. In Chabad, hakafos are also held on the night of Shemini Atzeres in the diaspora.',
  'Simchat Torah': 'We finish and restart the yearly Torah reading, dancing hakafos with the Torah scrolls.',
  'Chanukah': 'Eight nights of lighting the menorah for the miracle of the oil and the Maccabees’ victory. Light after nightfall (Friday: before Shabbos candles).',
  'Asara B\'Tevet': 'A dawn-to-nightfall fast marking the start of Nebuchadnezzar’s siege of Jerusalem.',
  'Tu BiShvat': 'The New Year for trees. Custom to eat fruits, especially those for which Eretz Yisrael is praised.',
  'Shabbat Shirah': 'The Shabbos of Song, when the Song at the Sea is read in Parshas Beshalach.',
  'Purim Katan': 'The “small Purim” in Adar I of a leap year: no Megillah, but a joyful day without Tachanun.',
  'Shushan Purim Katan': 'The day after Purim Koton; also without Tachanun.',
  'Shabbat Shekalim': 'The first of the four special Shabbosos: a reading about the half-shekel every Jew gave to the Mishkan.',
  'Shabbat Zachor': 'The Shabbos before Purim: we hear the Torah command to remember Amalek. Everyone tries to hear it.',
  'Ta\'anit Esther': 'A dawn-to-nightfall fast before Purim, recalling Esther and the Jewish people’s fasting and prayer.',
  'Purim': 'We celebrate the rescue in Persia: hear the Megillah night and day, send mishloach manos, give to the poor and have a festive meal.',
  'Shushan Purim': 'Purim as celebrated in walled cities such as Jerusalem, one day after Purim.',
  'Shabbat Parah': 'The third special Shabbos: the reading about the red heifer, preparing for purity before Pesach.',
  'Shabbat HaChodesh': 'The Shabbos before Rosh Chodesh Nissan: the reading about the first mitzvah, sanctifying the new month.',
  'Shabbat HaGadol': 'The “Great Shabbos” before Pesach, recalling the miracle in Egypt before the Exodus.',
  'Ta\'anit Bechorot': 'The Fast of the Firstborn on Erev Pesach. Firstborns usually attend a siyum, which exempts them from fasting.',
  'Pesach': 'The festival of freedom: the Seder, matzah and no chametz, recalling the Exodus from Egypt. Sefiras HaOmer begins on the second night.',
  'Pesach Sheni': 'The “second Pesach” for those who could not bring the Pesach offering. Custom to eat matzah; a message that it’s never too late.',
  'Lag BaOmer': 'The 33rd day of the Omer and the yahrzeit of Rabbi Shimon bar Yochai. A joyful day of parades, bonfires and unity.',
  'Shavuot': 'The day the Torah was given at Sinai. Custom to stay up learning the first night and to hear the Ten Commandments.',
  'Tzom Tammuz': 'A dawn-to-nightfall fast when Jerusalem’s walls were breached, beginning the Three Weeks of mourning.',
  'Shabbat Chazon': 'The Shabbos before Tisha B’Av, named for Yeshayahu’s vision read as the haftarah.',
  'Tish\'a B\'Av': 'The saddest day of the year, mourning both Temples’ destruction: a 25-hour fast, Eichah and kinos.',
  'Shabbat Nachamu': 'The Shabbos after Tisha B’Av: “Nachamu, nachamu” — comfort, comfort My people.',
  'Tu B\'Av': 'A day of joy in the Temple era. From now the nights lengthen — time to add in Torah study.',
  'Rosh Hashana LaBehemot': 'Rosh Chodesh Elul: the new year for animal tithes, and the start of the month of preparation and teshuvah.',
  'Leil Selichot': 'The night Selichos begin before Rosh Hashanah. In Chabad, the first Selichos are said after midnight.',
  'Shabbat Mevarchim': 'The Shabbos before Rosh Chodesh, when the new month is blessed. Chabad custom: the whole Tehillim is said before davening.',
  'Rosh Chodesh': 'The new month. Hallel (half) and Ya’aleh V’yavo are added; a semi-festive day.',
  'Yom Kippur Katan': 'Some observe the day before Rosh Chodesh as a “small Yom Kippur” of teshuvah.',
  'Purim Meshulash': 'When Shushan Purim falls on Shabbos in Jerusalem, Purim is spread over three days.',
  'Birkat Hachamah': 'Once in 28 years, the blessing over the sun returning to its position at creation.',
};
export const PARSHA_NOTE = 'The weekly Torah portion read in shul this Shabbos.';
export const FAST_NOTE = 'Minor fasts run from dawn (Alos) until nightfall.';

// Chabad dates. [month, day, title, note]
export const CHABAD_DAYS = [
  [7, 6, 'Yahrzeit of Rebbetzin Chana', 'Yahrzeit of Rebbetzin Chana Schneerson, the Rebbe’s mother (5725 / 1964).'],
  [7, 13, 'Yud-Gimmel Tishrei', 'Yahrzeit of the Rebbe Maharash, the fourth Lubavitcher Rebbe (5643 / 1882).'],
  [8, 20, 'Chof Cheshvan', 'Birthday of the Rebbe Rashab, the fifth Lubavitcher Rebbe (5621 / 1860).'],
  [9, 9, 'Tes Kislev', 'Birthday and yahrzeit of the Mitteler Rebbe, the second Lubavitcher Rebbe.'],
  [9, 10, 'Yud Kislev', 'The Mitteler Rebbe’s release from imprisonment (5587 / 1826).'],
  [9, 14, 'Yud-Daled Kislev', 'Wedding anniversary of the Rebbe and Rebbetzin Chaya Mushka (5689 / 1928).'],
  [9, 19, 'Yud-Tes Kislev', 'The Alter Rebbe’s release from prison (5559 / 1798), the “Rosh Hashanah of Chassidus”. Also the yahrzeit of the Maggid of Mezritch.'],
  [10, 5, 'Hei Teves', '“Didan Notzach”: the 1987 court ruling that the Previous Rebbe’s library belongs to Agudas Chassidei Chabad.'],
  [10, 24, 'Chof-Daled Teves', 'Yahrzeit of the Alter Rebbe, founder of Chabad and author of the Tanya (5573 / 1812).'],
  [11, 10, 'Yud Shevat', 'Yahrzeit of the Previous Rebbe (5710 / 1950), and the day the Rebbe formally accepted the leadership a year later.'],
  [11, 22, 'Chof-Beis Shevat', 'Yahrzeit of Rebbetzin Chaya Mushka Schneerson, the Rebbe’s wife (5748 / 1988).'],
  [1, 2, 'Beis Nissan', 'Yahrzeit of the Rebbe Rashab (5680 / 1920), and the day the Previous Rebbe assumed leadership.'],
  [1, 11, 'Yud-Alef Nissan', 'The Rebbe’s birthday (5662 / 1902). Chassidim begin saying the Tehillim chapter of the Rebbe’s new year.'],
  [1, 13, 'Yud-Gimmel Nissan', 'Yahrzeit of the Tzemach Tzedek, the third Lubavitcher Rebbe (5626 / 1866).'],
  [3, 28, 'Chof-Ches Sivan', 'The Rebbe and Rebbetzin arrived safely in America from war-torn Europe (5701 / 1941).'],
  [4, 3, 'Gimmel Tammuz', 'Yahrzeit of the Rebbe (5754 / 1994). Also the day in 1927 the Previous Rebbe’s death sentence was commuted to exile.'],
  [4, 12, 'Yud-Beis Tammuz', 'Birthday of the Previous Rebbe (5640 / 1880) and his release from Soviet imprisonment (5687 / 1927).'],
  [4, 13, 'Yud-Gimmel Tammuz', 'The day the Previous Rebbe’s release officially took effect (5687 / 1927).'],
  [5, 20, 'Chof Av', 'Yahrzeit of Rabbi Levi Yitzchak Schneerson, the Rebbe’s father, who died in exile in Kazakhstan (5704 / 1944).'],
  [6, 15, 'Tes-Vov Elul', 'Founding of Tomchei Temimim, the Lubavitch yeshivah, by the Rebbe Rashab (5657 / 1897).'],
  [6, 18, 'Chai Elul', 'Birthday of the Baal Shem Tov (5458 / 1698) and of the Alter Rebbe (5505 / 1745).'],
];

/** Chabad dates on Hebrew month m, day d. */
export function chabadDaysOn(m, d) {
  return CHABAD_DAYS.filter((x) => x[0] === m && x[1] === d).map(([, , title, note]) => ({ title, note }));
}

// Chabad.org daily study (link patterns from https://www.chabad.org/tools/rss/dailystudy_rss.xml).
const CDO = 'https://www.chabad.org/dailystudy/';
export const STUDY = [
  { id: 'chumash', name: 'Chumash', he: 'חומש', sub: 'with Rashi', url: (t) => `${CDO}torahreading.asp?tdate=${t}` },
  { id: 'tehillim', name: 'Tehillim', he: 'תהלים', sub: 'monthly cycle', url: (t) => `${CDO}tehillim.asp?tdate=${t}` },
  { id: 'tanya', name: 'Tanya', he: 'תניא', sub: 'daily lesson', url: (t) => `${CDO}tanya.asp?tdate=${t}` },
  { id: 'rambam', name: 'Rambam', he: 'רמב״ם', sub: '3 chapters', url: (t, ch) => `${CDO}rambam.asp?tdate=${t}&rambamChapters=${ch === 1 ? 1 : 3}` },
  { id: 'mitzvos', name: 'Sefer HaMitzvos', he: 'ספר המצוות', sub: 'with 1 chapter', url: (t) => `${CDO}seferHamitzvos.asp?tdate=${t}` },
  { id: 'hayomyom', name: 'Hayom Yom', he: 'היום יום', sub: 'today’s entry', url: (t) => `${CDO}hayomyom.asp?tdate=${t}` },
];

// Hebrew text of the Omer blessing (standard liturgy; the count line comes from Hebcal).
export const OMER_BRACHA = 'בָּרוּךְ אַתָּה ה׳ אֱלֹקֵינוּ מֶלֶךְ הָעוֹלָם, אֲשֶׁר קִדְּשָׁנוּ בְּמִצְוֹתָיו, וְצִוָּנוּ עַל סְפִירַת הָעֹמֶר.';
