import 'package:flutter/rendering.dart';

/// How far beyond the screen a page of sections is built: far enough to be all of it.
///
/// A plain ListView builds only what is near the screen and guesses the rest of the page's
/// height from the sections it has seen. On a page whose sections differ a lot in height,
/// such as Me, the guess moves as you scroll: it can drop below where you already are, and
/// on an iPhone the bounce then pulls the page back up. These pages are short, so building
/// every section costs nothing and the height is always known. Long lists of rows, which
/// are alike, keep the default.
const ScrollCacheExtent wholePage = ScrollCacheExtent.pixels(100000);
