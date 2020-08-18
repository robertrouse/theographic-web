import React, { useState } from 'react';
import { Link } from 'gatsby';
import Layout from '../components/layout.js';
import { Typography, Container, Box } from '@material-ui/core';

export default function About ()  {

  return(
    <Layout>
      <Container maxWidth="md">
        <h1>About Theographic</h1>
        <p>
        Theographic is a knowledge graph of the Bible, weaving data about people, places, and periods of time into the tapestry of God's story. 
        This data enables smarter search algorithms, new apps, and exciting research potential. It's an open-source project to share information 
        about the scriptures in our digital world.
        </p>
      </Container>

      <div className="footer"></div>
    </Layout>
  )
}
