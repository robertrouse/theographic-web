import React from 'react';
import Layout from '../components/layout.js';
import { Container } from '@material-ui/core';

export default function About ()  {

  return(
    <Layout>
      <Container maxWidth="sm">
        <h1>About Theographic</h1>
        <p><strong>Connecting biblical knowledge to our world today</strong></p>
        <p>
        Theographic is a <a href="https://www.youtube.com/watch?v=mmQl6VGvX-c">knowledge graph</a> of the Bible, weaving data about people, places, and periods of time into the tapestry of God&#x27;s story. This data enables smarter search algorithms, new apps, and exciting research potential. It&#x27;s an open-source project to share information about the scriptures in our digital world.
        </p>
        <p>&nbsp;</p>

        <h2>Who It&#x27;s For</h2>

        <ul>
          <li>
            <strong>Bible Students</strong>: Find related information on any passage or subject without expensive software or endless searching.
          </li>

          <li>
            <strong>Visual Storytellers:</strong> Images representing data capture attention and spark curiosity. See examples at <a href="https://viz.bible">Viz.Bible</a>.
          </li>

          <li>
            <strong>Developers: </strong>Use a GraphQL API to power your Bible websites and mobile apps.
          </li>

          <li>
            <strong>Machine Learning &amp; AI Researchers</strong>: Knowledge graphs provide critical context to train algorithms and interpret results.
          </li>
        </ul>
        <p>&nbsp;</p>

        <h2>Contact</h2>
        <p>To get in touch, email <a href="mailto:robert@viz.bible">robert@viz.bible</a> or <a href="https://twitter.com/bibleviz">@bibleviz</a> on Twitter. </p>
        <p>Sign up <a href="http://eepurl.com/dzAtOj">here </a>for e-mail updates.</p>
        <p>&nbsp;</p>

        <h2>License</h2>
        <p>All data described on this site is licensed under a <a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a> unless otherwise specified.</p>

      </Container>

      <div className="footer"></div>
    </Layout>
  )
}
